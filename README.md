# mutate4ts

`mutate4ts` performs one-at-a-time mutation testing for TypeScript and TSX source files. It uses the TypeScript scanner, so comments and string contents are not mutation sites.

## Install

```bash
npm install --global github:lukasa1993/mutate4ts
```

## Run

```bash
mutate4ts --test-command "npm test" --fail-on-survivors
```

Useful controls:

```bash
mutate4ts --list
mutate4ts --max-mutants 20 --timeout 30
mutate4ts src/domain
```

The tool verifies the baseline test suite, changes one token, runs the test command, and restores the file in a `finally` block. Its manifest is stored at `target/mutation/mutations.json` by default.

Supported mutations include equality and relational operators, `&&`/`||`, booleans, and `+`/`-`.

## Development

```bash
npm ci
npm test
```
