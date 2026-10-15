# ILMATILA beta 0.2.0-beta.6

This release hardens the GitHub Pages release path. Deployed build identity checks now tolerate normal Pages propagation and cache delay while still failing on a persistent mismatch. The beta also keeps staging preflight limited to beta releases, so a staging deployment cannot be blocked by its own preflight.

Validation is recorded by the GitHub Actions Pages workflow for the tagged commit.
