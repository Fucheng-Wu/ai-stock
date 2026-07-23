function nextRequestVersion(versions, key) {
  const version = (versions[key] || 0) + 1
  versions[key] = version
  return version
}

function isLatestRequest(versions, key, version) {
  return versions[key] === version
}

module.exports = {
  nextRequestVersion,
  isLatestRequest
}
