const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java'),
  'utf8'
)
const compact = source.replace(/\s+/g, '')

assert(source.includes('stock:position:remove'))
assert(source.includes('@DeleteMapping("/{id}")'))
assert(compact.includes('service.remove(getUserId(),id)'))

console.log('stock position controller remove contract passed')
