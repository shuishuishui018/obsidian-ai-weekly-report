// 冒烟测试运行器：把 obsidian 模块替换为测试替身后打包执行
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, "smoke.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: resolve(here, ".smoke.cjs"),
  logLevel: "error",
  plugins: [
    {
      name: "obsidian-stub",
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: resolve(here, "obsidian-stub.ts") }));
      },
    },
  ],
});

const child = spawn(process.execPath, [resolve(here, ".smoke.cjs")], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
