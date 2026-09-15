import { readFileSync } from 'node:fs'

interface PackageManifest {
  version: string
}

const packageManifest = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as PackageManifest

export default {
  newVersion: packageManifest.version,
  output: 'CHANGELOG.md',
}
