import {test} from 'node:test'
import assert from 'node:assert/strict'
import {visitorHeaders,ownMeteorId} from './visitorIdentity'

test('both visitor views share validated identity without transmitting invalid or private storage',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>()
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null}})
  assert.deepEqual(visitorHeaders(),{});assert.equal(ownMeteorId(),undefined)
  const id='12345678-1234-4234-8234-123456789abc',meteor='abcdef123456abcdef123456'
  values.set('quartz-visitor-id',id);values.set('quartz-visitor-meteor-id',meteor);values.set('private-secret','not-public')
  assert.deepEqual(visitorHeaders(),{'X-Visitor-ID':id});assert.equal(ownMeteorId(),meteor)
  for(const invalid of ['abc','12345678-1234-1234-8234-123456789abc',id+'\r\nInjected: true','']){
   values.set('quartz-visitor-id',invalid);assert.deepEqual(visitorHeaders(),{})
  }
  for(const invalid of ['bad',meteor+'0','']){values.set('quartz-visitor-meteor-id',invalid);assert.equal(ownMeteorId(),undefined)}
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw new Error('blocked')}})
  assert.deepEqual(visitorHeaders(),{});assert.equal(ownMeteorId(),undefined)
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage')}
})
