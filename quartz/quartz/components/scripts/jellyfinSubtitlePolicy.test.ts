import {test} from 'node:test'
import assert from 'node:assert/strict'
import {subtitleNeedsBurn,subtitleBurnInForBrowser} from './jellyfinSubtitlePolicy'
test('Safari and iOS use server subtitles while other browsers retain the user preference',()=>{
 for(const browser of [{safari:true},{iOS:true},{safari:true,iOS:true}]) {
  for(const mode of ['auto','onlyimageformats','allcomplexformats','all']) {
   const effective=subtitleBurnInForBrowser(mode,browser)
   for(const format of ['ass','ssa','pgs','vtt'])assert.equal(subtitleNeedsBurn(format,effective),true)
  }
 }
 for(const mode of ['auto','onlyimageformats','allcomplexformats','all'])assert.equal(subtitleBurnInForBrowser(mode,{}),mode)
})
test('Jellyfin subtitle burn-in preferences distinguish image, complex and plain text formats',()=>{
 for(const type of ['pgs','ass','ssa','vtt'])assert.equal(subtitleNeedsBurn(type,'auto'),false)
 assert.equal(subtitleNeedsBurn('pgs','onlyimageformats'),true)
 assert.equal(subtitleNeedsBurn('ass','onlyimageformats'),false)
 for(const type of ['pgs','ass','ssa'])assert.equal(subtitleNeedsBurn(type,'allcomplexformats'),true)
 assert.equal(subtitleNeedsBurn('vtt','allcomplexformats'),false)
 for(const type of ['pgs','ass','ssa','vtt'])assert.equal(subtitleNeedsBurn(type,'all'),true)
})
