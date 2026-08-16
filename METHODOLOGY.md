# Counting and scope methodology

Code Budget limits maintained implementation, not repository storage. Tokei
counts nonblank, noncomment physical lines in recognized source and
structured-data formats. The implementation total aggregates every area whose
`kind` is `implementation`, including build, release, lint, and operational
tooling. It has one hard ceiling selected by `scope`.

Verification is measured but unlimited. Tokei counts recognized test and
fixture formats; unrecognized textual verification fixtures use nonblank
content lines, while opaque binary fixtures contribute only to file counts.
Deleting tests therefore cannot improve the enforced implementation result.

Documentation, lockfiles, licenses, and package metadata are identified
separately. Source-like files which match no area and files matching multiple
areas fail configured checks. Generated and vendor candidates also fail until
the config classifies them as implementation, verification, or an `excluded`
area with a human-readable reproducibility reason.

## Calibration dataset

The dataset embedded in `SCOPES` is deliberately small and inspectable. Each
entry records a repository, immutable release reference, and the observed
implementation LOC used during the 0.1 calibration. Reproduction uses the
release tree, removes tests/examples/fixtures/generated/vendor trees according
to the rules above, and runs the package's pinned Tokei version. Benchmarks are
context, not a formula: ceilings are fixed round policy values and never
derived from the adopting repository's present size.

No default uses bytes, disk size, file-count ratchets, historical baselines, or
test-to-production ratios. The ratio printed in reports is neutral context.
