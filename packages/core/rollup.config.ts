import { defineConfig } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { minify, swc } from 'rollup-plugin-swc3'
import webWorkerLoader from 'rollup-plugin-web-worker-loader'

const bundleName = 'HashWorker'

// 一般来说现代项目不需要自行压缩这些 cjs/esm 模块，因为现代构建工具会自动处理
// 其次发包发布压缩的包意义在于减少安装大小，但是实际上这个行为可有可无
// 关于 iife/umd 面向现代的前端提供 iife 就可以了。
// 因此你不需要过多复杂的配置。

function workerPluginsConfig() {
  return webWorkerLoader({
    targetPlatform: 'base64',
    extensions: ['.ts'],
  })
}

export default defineConfig([
  // esm 格式产物
  {
    input: 'src/main.ts',
    output: [
      { file: 'dist/index.mjs', format: 'esm', exports: 'named' },
      { file: 'dist/index.js', format: 'cjs', exports: 'named' },
    ],
    plugins: [nodeResolve(), swc({ sourceMaps: true }), workerPluginsConfig()],
  },
  // esm 类型产物
  {
    input: 'src/main.ts',
    output: { file: 'dist/index.d.ts' },
    plugins: [dts()],
  },
  {
    input: 'src/worker/test-worker.web-worker.ts',
    output: { file: 'dist/worker/test-worker.web-worker.mjs', format: 'esm' },
    plugins: [
      nodeResolve({
        preferBuiltins: false, // 告诉插件不要使用 Node.js 内置的模块
      }),
      swc({ sourceMaps: true }),
    ],
  },
  // iife 格式产物
  {
    input: 'src/main.ts',
    output: { file: 'dist/global.js', format: 'iife', name: bundleName },
    plugins: [
      nodeResolve(),
      swc({ sourceMaps: true }),
      minify({ mangle: true, module: true, compress: true, sourceMap: true }),
      workerPluginsConfig(),
    ],
  },
  // iife 类型产物
  {
    input: 'src/iife.ts',
    output: { file: 'dist/global.d.ts', format: 'es' },
    plugins: [dts()],
  },
])
