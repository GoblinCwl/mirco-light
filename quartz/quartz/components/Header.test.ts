import {test} from 'node:test'
import assert from 'node:assert/strict'
import {h} from 'preact'
import {render} from 'preact-render-to-string'
import Header from './Header'
import type {QuartzComponentProps} from './types'

test('page header styles cannot add spacing to dialog and drawer headers',()=>{
 const Component=Header()
 const html=render(h(Component,{children:[h('h1',null,'Title')]} as QuartzComponentProps))
 const className=html.match(/<header class="([^"]+)"/)?.[1]
 assert.ok(className)
 const css=[Component.css].flat().join('\n')
 const selectors=[...css.matchAll(/([^{}]+)\{/g)].map(match=>match[1].trim())
 assert.ok(selectors.length>0)
 assert.ok(selectors.every(selector=>selector.startsWith(`.${className}`)))
 assert.doesNotMatch(css,/(?:^|})\s*header\s*(?:\{|h1)/)
})
