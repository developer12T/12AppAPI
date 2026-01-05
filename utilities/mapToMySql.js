// utils/mapToMySql.js
function mapToMySql(item, columnMap) {
  const mapped = {}

  for (const [key, value] of Object.entries(item)) {
    if (columnMap[key] !== undefined) {
      mapped[columnMap[key]] = value
    }
  }

  return mapped
}

module.exports = mapToMySql
