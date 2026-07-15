# AI Website Workbench Version

Current version: `v0.4.0-mvp-image-integrity`

Date: 2026-07-15

This version marks the MVP state after public deployment, real text/image provider integration, worker-queue website generation, Netlify lightweight deployment support, customer case archiving, QR-code upload support, and the image-integrity delivery safeguards.

Key guarantee added in this version:

- If a customer does not upload business images, the generator must obtain at least one usable generated content image before producing a final website.
- Standard delivery packages include the runnable website plus archived source assets and an integrity report.
- The system should not silently deliver a visually weak no-image website as a successful result.
