# Counting and scope methodology

Code Budget limits product implementation. Tokei
counts nonblank, noncomment physical lines in recognized source and
structured-data formats. The implementation total aggregates every area whose
`kind` is `implementation`. It has one hard ceiling selected by `scope`.

Tooling is measured separately and unlimited. It covers development, build,
release, lint, and operational support. All files under `.github/**` default
to tooling. Root scripts, tools, and tooling directories also default to
tooling, except recognized tests and fixtures. Explicit configuration can
classify product logic in these directories as implementation. Tooling uses
the same Tokei LOC measurement as implementation; unrecognized files remain
in its file count. It does not enter the verification-to-implementation ratio.

Verification is measured but unlimited. Tokei counts recognized test and
fixture formats; unrecognized textual verification fixtures use nonblank
content lines, while opaque binary fixtures contribute only to file counts.
Deleting tests therefore cannot improve the enforced implementation result.

Documentation, lockfiles, licenses, and package metadata are identified
separately. Source-like files which match no area and files matching multiple
areas fail configured checks. Generated and vendor candidates also fail until
the config classifies them as implementation, tooling, verification, or an `excluded`
area with a human-readable reproducibility reason.

## Calibration dataset

The dataset embedded in `SCOPES` is deliberately small and inspectable. Each
entry records a repository, immutable release reference, and the observed
implementation LOC used during the original 0.1 calibration. These are
historical measurements from before tooling became a separate classification
in 0.1.2; they have not been recalculated using the new boundary. Benchmarks
provide context. Ceilings remain fixed round policy values and are never
derived from the adopting repository's present size.

No default uses bytes, disk size, file-count ratchets, historical baselines, or
test-to-production ratios. The ratio printed in reports is neutral context.
