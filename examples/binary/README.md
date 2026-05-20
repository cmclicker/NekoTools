# NekoBinary example fixtures

Canonical inputs the test suite and docs reference. These are
deliberately tiny — the point is to show every parser's happy path
and document the input format, not to stress-test.

| File                | Parser              | Expected artifact kind |
| ------------------- | ------------------- | ---------------------- |
| `decimal.input.txt` | `binary.decimal`    | `binary.number`        |
| `binary.input.txt`  | `binary.binary`     | `binary.number`        |
| `hex.input.txt`     | `binary.hex`        | `binary.bytes`         |
| `base64.input.txt`  | `binary.base64`     | `binary.bytes`         |
| `utf8.input.txt`    | `binary.utf8`       | `binary.text`          |
