function toCents(amount) {
  if (amount === undefined || amount === null || amount === '') {
    return null;
  }
  const number = Number(amount);
  if (Number.isNaN(number)) {
    return null;
  }
  return Math.round(number * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

module.exports = { toCents, fromCents };
