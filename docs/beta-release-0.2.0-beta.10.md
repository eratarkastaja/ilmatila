# ILMATILA beta 0.2.0-beta.10

This release completes the Pages deployment hardening: the staging deploy adapter is checked out in CI and has the artifact-read permission it needs to create a unique staging deployment version.

Validation is recorded by the GitHub Actions Pages workflow for the tagged commit.
