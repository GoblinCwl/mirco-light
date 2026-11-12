import {test} from 'node:test'
import assert from 'node:assert/strict'
import {repoLanguageChart} from './repoLanguageChart'

test('language percentages reflect code bytes and escape language names',()=>{
 const html=repoLanguageChart({TypeScript:750,JavaScript:250,empty:0,negative:-1})
 assert.match(html,/75\.0%/);assert.match(html,/25\.0%/);assert.doesNotMatch(html,/empty|negative/)
 assert.match(repoLanguageChart({'<script>':100}),/&lt;script&gt;/)
 assert.match(repoLanguageChart({}),/暂无语言统计/)
})
