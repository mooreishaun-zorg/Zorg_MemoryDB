#!/usr/bin/env python3
"""Queue a ComfyUI workflow and save the generated image locally.

This runner is intentionally dependency-light for OpenClaw: it uses only the
Python standard library and polls ComfyUI history instead of requiring
websocket-client.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


DEFAULT_SERVER = os.environ.get("COMFYUI_SERVER", "127.0.0.1:8188")
DEFAULT_WORKFLOW = Path(__file__).resolve().parents[1] / "references" / "comfy-default-api.json"
DEFAULT_OUTPUT_DIR = Path(os.environ.get("ZORG_IMAGE_OUTPUT_DIR", "generated_images/comfy"))
DEFAULT_SEED_FILE = Path(__file__).resolve().parents[1] / "references" / "image-seed.json"
TEXT_NODE_ID = "3"
KSAMPLER_ID = "5"
SAVE_NODE_ID = "9"
LATENT_NODE_ID = "6"


def api_json(url: str, *, data: bytes | None = None, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, data=data)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def queue_prompt(server: str, workflow: dict, client_id: str) -> str:
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode("utf-8")
    response = api_json(f"http://{server}/prompt", data=payload)
    prompt_id = response.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI did not return prompt_id: {response}")
    return str(prompt_id)


def get_history(server: str, prompt_id: str) -> dict:
    return api_json(f"http://{server}/history/{urllib.parse.quote(prompt_id)}")


def get_image(server: str, image: dict) -> bytes:
    params = urllib.parse.urlencode(
        {
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        }
    )
    with urllib.request.urlopen(f"http://{server}/view?{params}", timeout=60) as response:
        return response.read()


def wait_for_images(server: str, prompt_id: str, timeout_seconds: int, poll_seconds: float) -> list[dict]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        history = get_history(server, prompt_id)
        entry = history.get(prompt_id)
        if entry:
            outputs = entry.get("outputs") or {}
            images: list[dict] = []
            preferred = outputs.get(SAVE_NODE_ID) or {}
            images.extend(preferred.get("images") or [])
            if not images:
                for node_output in outputs.values():
                    images.extend((node_output or {}).get("images") or [])
            if images:
                return images
        time.sleep(poll_seconds)
    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")


def load_workflow(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_fixed_seed(path: Path) -> int:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle).get("seed")
    if not isinstance(value, int) or value < 0:
        raise ValueError(f"Seed file must contain a non-negative integer seed: {path}")
    return value


def prepare_workflow(
    workflow: dict,
    prompt: str,
    seed: int | None,
    filename_prefix: str,
    width: int | None,
    height: int | None,
    steps: int | None,
    cfg: float | None,
) -> int:
    workflow[TEXT_NODE_ID]["inputs"]["text"] = prompt
    actual_seed = seed if seed is not None else load_fixed_seed(DEFAULT_SEED_FILE)
    workflow[KSAMPLER_ID]["inputs"]["seed"] = actual_seed
    if width is not None:
        workflow[LATENT_NODE_ID]["inputs"]["width"] = width
    if height is not None:
        workflow[LATENT_NODE_ID]["inputs"]["height"] = height
    if steps is not None:
        workflow[KSAMPLER_ID]["inputs"]["steps"] = steps
    if cfg is not None:
        workflow[KSAMPLER_ID]["inputs"]["cfg"] = cfg
    workflow[SAVE_NODE_ID]["inputs"]["filename_prefix"] = filename_prefix
    return actual_seed


def save_first_image(server: str, image: dict, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(get_image(server, image))
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate an image through ComfyUI and save it locally.")
    parser.add_argument("prompt", nargs="+", help="Positive prompt text to inject into workflow node 3.")
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"ComfyUI host:port. Default: {DEFAULT_SERVER}")
    parser.add_argument("--workflow", type=Path, default=DEFAULT_WORKFLOW, help="Workflow JSON path.")
    parser.add_argument("--output", type=Path, help="Output image path. Defaults under the OpenClaw workspace.")
    parser.add_argument("--seed", type=int, help="Optional deterministic seed; defaults to the canonical fixed seed file.")
    parser.add_argument("--width", type=int, help="Optional latent width override.")
    parser.add_argument("--height", type=int, help="Optional latent height override.")
    parser.add_argument("--steps", type=int, help="Optional sampler steps override.")
    parser.add_argument("--cfg", type=float, help="Optional sampler CFG override.")
    parser.add_argument("--timeout-seconds", type=int, default=900, help="Maximum wait for ComfyUI completion.")
    parser.add_argument("--poll-seconds", type=float, default=2.0, help="History poll interval.")
    parser.add_argument("--prefix", default="openclaw/comfy", help="ComfyUI SaveImage filename prefix.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    prompt = " ".join(args.prompt)
    workflow = load_workflow(args.workflow)
    client_id = str(uuid.uuid4())
    seed = prepare_workflow(
        workflow,
        prompt,
        args.seed,
        args.prefix,
        args.width,
        args.height,
        args.steps,
        args.cfg,
    )
    output = args.output or DEFAULT_OUTPUT_DIR / f"comfy_{int(time.time())}_{seed}.png"

    print(f"Prompt: {prompt}")
    print(f"Seed: {seed}")
    print(f"Server: {args.server}")
    prompt_id = queue_prompt(args.server, workflow, client_id)
    print(f"Queued: {prompt_id}")
    images = wait_for_images(args.server, prompt_id, args.timeout_seconds, args.poll_seconds)
    saved = save_first_image(args.server, images[0], output)
    print(f"Saved: {saved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
