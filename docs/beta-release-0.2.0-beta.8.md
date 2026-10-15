# ILMATILA beta 0.2.0-beta.8

This release fixes the GitHub Pages deployment identity used by the staging and beta gates. A staging deployment now receives a unique Pages deployment version, so a later beta deployment of the same source commit updates the live root instead of reusing the staging snapshot.

Validation is recorded by the GitHub Actions Pages workflow for the tagged commit.
