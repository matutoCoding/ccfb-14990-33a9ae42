// 测试专用 ESM 解析钩子：给无扩展相对路径补 .ts，生产代码保持 Vite 风格不动
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    const baseUrl = new URL(specifier, context.parentURL)
    const basePath = fileURLToPath(baseUrl)
    for (const candidate of [`${basePath}.ts`, `${basePath}/index.ts`]) {
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context)
      }
    }
  }
  return nextResolve(specifier, context)
}
