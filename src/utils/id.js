let counter = Date.now();

function generateId() {
  counter++;
  return counter.toString(36) + Math.random().toString(36).substring(2, 8);
}

module.exports = { generateId };
