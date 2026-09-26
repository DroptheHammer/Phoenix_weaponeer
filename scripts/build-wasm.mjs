// Builds crates/wasm for the browser and writes the JavaScript bindings to
// src/generated/weaponeer-wasm (git-ignored). Run as `npm run build:wasm`.
//
// Rust embeds source file paths in the binary (for panic messages). Built on
// a personal machine those are /Users/<name>/... and ~/.cargo/..., and the
// .wasm is published with the web app — so every such path is rewritten to a
// neutral name here. scripts/web-privacy-check.mjs fails the build if one
// ever slips through.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cargoHome = process.env.CARGO_HOME ?? join(homedir(), '.cargo');
const rustupHome = process.env.RUSTUP_HOME ?? join(homedir(), '.rustup');

const remap = [
  `--remap-path-prefix=${repo}=phoenix`,
  `--remap-path-prefix=${cargoHome}=cargo`,
  `--remap-path-prefix=${rustupHome}=rustup`,
  `--remap-path-prefix=${homedir()}=home`,
].join(' ');

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: repo, stdio: 'inherit', env: { ...process.env, ...env } });

run(
  'cargo',
  ['build', '--manifest-path', 'crates/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release'],
  // Appended, so flags set by the caller still apply.
  { RUSTFLAGS: [process.env.RUSTFLAGS, remap].filter(Boolean).join(' ') },
);
run('wasm-bindgen', [
  '--target',
  'web',
  '--out-dir',
  'src/generated/weaponeer-wasm',
  'crates/wasm/target/wasm32-unknown-unknown/release/weaponeer_wasm.wasm',
]);
