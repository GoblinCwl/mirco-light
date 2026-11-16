import { previewChoices, type PreviewFile, type PreviewSettings } from './drivePreviewOptions'
import { drivePreviewKind } from './openlistShared'
export function fileHoverSupported(file:PreviewFile,config:PreviewSettings,share=true):boolean {
 if(file.is_dir)return true
 const kind=drivePreviewKind(file.name)
 if(file.type===2||file.type===3||['video','audio','pdf'].includes(kind)||/\.(?:mkv|avi|mpg|mpeg|ts|m2ts|mts|flv|wmv|m3u8|wma|aiff|ape)$/i.test(file.name))return false
 const archives=share?String(config.share_archive_preview??'true')==='true':false
 return previewChoices(file,config,share,archives).some(choice=>!choice.external&&choice.key!=='download')
}
