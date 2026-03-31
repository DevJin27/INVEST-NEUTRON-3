function createStateLock() {
  let stateLock = Promise.resolve();

  async function withStateLock(task) {
    const run = stateLock.then(task, task);
    stateLock = run.catch(() => {});
    return run;
  }

  return {
    withStateLock,
  };
}

module.exports = {
  createStateLock,
};
