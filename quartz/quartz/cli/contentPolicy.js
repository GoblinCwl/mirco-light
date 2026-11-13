import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {defaultIgnorePatterns,defaultUnlistedPatterns,normalizePolicy} from './contentPolicy.mjs'
export const policyDirectory=process.env.QUARTZ_JOURNAL_DIR||'/run/quartz-chronicle'
export const policyPath=join(policyDirectory,'content-policy.json')
export function readContentPolicy(filename=policyPath){
  try{return normalizePolicy(JSON.parse(readFileSync(filename,'utf8')))}
  catch(error){if(error.code!=='ENOENT')throw error;return {ignorePatterns:defaultIgnorePatterns,unlistedPatterns:defaultUnlistedPatterns,directoryHiddenPatterns:[]}}
}
