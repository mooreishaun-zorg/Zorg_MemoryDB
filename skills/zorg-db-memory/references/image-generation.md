# Image Generation Integration

Image generation is part of the `zorg-db-memory` implementation. Before a
Zorg self-portrait is generated, the runtime recalls the canonical visual
identity and the requested framing, clothing, pose, and orientation. A render
is inspected and rejected when it adds armor, changes the requested pose or
clothing, or produces a generic or unrelated person.

The ComfyUI support runner is `scripts/comfy_image_gen.py` and its public-safe
workflow is `references/comfy-default-api.json`. When no one-off seed is
explicitly supplied, the runner reads the fixed canonical seed from
`references/image-seed.json`; it never randomizes the seed. The file is the
single source of truth for repeatable canonical renders.

The fixed seed improves repeatability but does not guarantee identity by
itself. The prompt, model, workflow, visual inspection, and rejection gate are
also required. Private model files, credentials, generated images, local
paths, and Telegram delivery metadata remain outside the public package.
