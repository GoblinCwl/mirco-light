import {createServer} from 'node:http'
import {mkdir,stat,chown,chmod,unlink,writeFile,rename} from 'node:fs/promises'
import {join} from 'node:path'
import {policyDirectory,policyPath,readContentPolicy} from './contentPolicy.js'
import {normalizePolicy} from './contentPolicy.mjs'

// No TCP port or shell command: the authenticated Go backend can only request a full rebuild.
export async function startBuildControl(rebuild,{directory=policyDirectory,filename=policyPath}={}){
  await mkdir(directory,{recursive:true})
  const socket=join(directory,'quartz-build.sock')
  try{await unlink(socket)}catch(error){if(error.code!=='ENOENT')throw error}
  let status={phase:'idle',message:'尚未执行重载'},running=false
  const saveStatus=async()=>{
    const path=join(directory,'build-status.json')
    await writeFile(path+'.tmp',JSON.stringify(status),{mode:0o600})
    if(process.getuid?.()===0){const owner=await stat(directory);await chown(path+'.tmp',owner.uid,owner.gid)}
    await rename(path+'.tmp',path)
  }
  await saveStatus()
  const send=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
  const server=createServer(async(req,res)=>{
    if(req.url==='/status'&&req.method==='GET'){try{send(res,200,{...status,active:readContentPolicy(filename)})}catch{send(res,503,{error:'无法读取生效规则，请检查内容发布配置文件'})}return}
    if(req.url!=='/reload'||req.method!=='POST'){send(res,404,{error:'接口不存在'});return}
    if(running){send(res,409,{error:'正在重载，请等待完成'});return}
    running=true
    try{
      let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw new Error('配置过大')}
      const policy=normalizePolicy(JSON.parse(text))
      // Persist the active rules, independently of the backend's saved draft.
      const snapshot={ignorePatterns:policy.ignorePatterns.join('\n'),unlistedPatterns:policy.unlistedPatterns.join('\n')}
      await writeFile(filename+'.tmp',JSON.stringify(snapshot,null,2),{mode:0o600})
      const owner=await stat(directory)
      if(process.getuid?.()===0)await chown(filename+'.tmp',owner.uid,owner.gid)
      await rename(filename+'.tmp',filename)
      status={phase:'running',startedAt:new Date().toISOString(),message:'正在重新生成站点'}
      await saveStatus()
      send(res,202,status)
      try{await rebuild();status={...status,phase:'success',finishedAt:new Date().toISOString(),message:'重载完成，配置已生效'}}
      catch(error){status={...status,phase:'error',finishedAt:new Date().toISOString(),message:'重载失败，请检查构建日志后重试'};console.error('管理重载失败：',error)}
    }catch(error){if(!res.headersSent)send(res,400,{error:error.message})}
    finally{running=false;await saveStatus().catch(error=>console.error('重载状态保存失败：',error))}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve)})
  const owner=await stat(directory)
  if(process.getuid?.()===0)await chown(socket,owner.uid,owner.gid)
  await chmod(socket,0o660)
  return server
}
