// Validates the restricted local Quartz build-control request.
export const defaultIgnorePatterns = ['index.md','Resources/**','Private/日记/**','.obsidian','**/.syncthing*','**/*sync-conflict*','**/!(*.md)']
export const defaultUnlistedPatterns = ['Work/**']
export function parsePatterns(value) {
  if(typeof value!=='string'||value.length>16000)throw new Error('规则需为文本，最多 16000 字符')
  const patterns=[...new Set(value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))]
  if(patterns.length>100)throw new Error('每类规则最多 100 条')
  for(const pattern of patterns)if(pattern.length>500||pattern.startsWith('/')||pattern.startsWith('!')||pattern.split('/').includes('..')||/[\\\x00-\x1f\x7f]/.test(pattern))throw new Error('请填写相对于文章根目录的 glob 规则，不支持绝对路径、反向规则或上级目录')
  return patterns
}
export function normalizePolicy(value) {
  return {ignorePatterns:parsePatterns(value.ignorePatterns),unlistedPatterns:parsePatterns(value.unlistedPatterns),directoryHiddenPatterns:parsePatterns(value.directoryHiddenPatterns??'')}
}
