# Supporting Services

`zorg-db-memory` expects the following services to be available on the host or reachable local network when workflows need them. The skill should discover first, report what it found, and request approval before installing anything.

## Required Discovery Order

1. Use PostgreSQL-backed memory recall for known service locations, ports, hosts, Dockge stacks, and previous install notes.
2. Inspect the local host for binaries, systemd units, Docker containers, Dockge stack files, Compose projects, and known ports.
3. Inspect known LAN hosts from memory when appropriate and safe.
4. If multiple candidates are found, ask which one to use before changing configuration.
5. If a needed service is missing, request approval to install it as a Dockge-managed container stack where possible.

Do not publish private LAN inventory, credentials, env files, tokens, tunnel secrets, model paths, or host-specific config into public docs or chat.

## Expected Services

### cloudflared

Purpose: tunnel/proxy support for controlled external reachability when explicitly configured.

Discovery hints:
- `cloudflared` binary
- `cloudflared` systemd units
- Docker/Dockge containers named for Cloudflare tunnel usage
- remembered tunnel host notes in MemoryDB

Install behavior: request approval before adding a Dockge container/stack. Never invent or expose tunnel tokens.

### ComfyUI

Purpose: image generation and visual asset workflows.

Preferred variant:
- Use `comfyui-nvidia` when NVIDIA GPU, driver, and container runtime support are present.
- Use CPU/default ComfyUI only when GPU support is unavailable or not approved.

Discovery hints:
- ComfyUI process or container
- known ports such as 8188 when documented by memory/local config
- local source paths or Dockge stacks named `comfyui` or `comfyui-nvidia`

Install behavior: request Dockge install approval and state whether GPU support was detected.

### kokoro-fastapi-cpu

Purpose: local text-to-speech / speech service support.

Discovery hints:
- Docker/Dockge stack or container named `kokoro-fastapi-cpu`
- remembered local endpoint in MemoryDB

Install behavior: request Dockge install approval if missing.

### bluenviron/mediamtx:latest

Purpose: local media relay/RTSP/WebRTC support for camera or stream workflows.

Discovery hints:
- Docker image `bluenviron/mediamtx:latest`
- container or stack named `mediamtx`
- known ports and camera workflow notes in MemoryDB

Install behavior: request Dockge install approval if missing. Do not expose camera URLs or credentials.

### ollama/ollama:latest

Purpose: local model runtime support.

Discovery hints:
- Docker image `ollama/ollama:latest`
- `ollama` binary or service
- known Ollama API endpoint in MemoryDB/local config

Install behavior: request Dockge install approval if missing. Do not pull large models unless separately approved.

### SearXNG

Purpose: local metasearch support for web/search workflows.

Discovery hints:
- stack/container named `searxng`
- known SearXNG endpoint in MemoryDB
- configured OpenClaw/search-provider references

Install behavior: request Dockge install approval if missing.

### faster-whisper-server

Purpose: local speech-to-text support.

Preferred image:
- `fedirz/faster-whisper-server:latest-cuda` when CUDA is available and approved.
- `fedirz/faster-whisper-server:latest-cpu` otherwise.

Discovery hints:
- Docker image or container using `fedirz/faster-whisper-server`
- remembered Whisper endpoint in MemoryDB
- GPU/CUDA support from local host checks

Install behavior: request Dockge install approval and state CPU/CUDA choice. Do not assume CUDA just because a GPU may exist; verify runtime support first.

## Dockge Install Request Rule

When missing services are detected, produce an install request summary before taking action:

- services found locally;
- services found on LAN from memory/local checks;
- services missing;
- proposed Dockge stack names;
- proposed images and CPU/GPU variants;
- required secrets or config placeholders that the user must provide privately;
- ports that need confirmation;
- verification checks after install.

Only proceed after explicit approval for the exact install set.
