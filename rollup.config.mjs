import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const pluginRoot = "src/com.f00d4tehg0dz.aipaints.sdPlugin";
const production = !process.env.ROLLUP_WATCH;

export default [
  {
    input: "src/plugin.ts",
    output: {
      file: `${pluginRoot}/bin/plugin.js`,
      format: "es",
      sourcemap: !production
    },
    plugins: [
      typescript({ tsconfig: "./tsconfig.json", noEmitOnError: true }),
      nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
      commonjs(),
      production && terser(),
      {
        name: "emit-module-package-file",
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "package.json", source: '{ "type": "module" }' });
        }
      }
    ]
  },
  {
    input: "src/property-inspector/inspector.ts",
    output: {
      file: `${pluginRoot}/ui/inspector.js`,
      format: "iife",
      sourcemap: !production
    },
    plugins: [
      typescript({ tsconfig: "./tsconfig.json", noEmitOnError: true }),
      production && terser()
    ]
  }
];
