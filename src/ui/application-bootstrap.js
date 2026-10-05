/** Keep browser compatibility checks and application startup behind one failure boundary. */
export async function bootApplication({ detectCompatibility, loadApplication, onError }) {
  let issue;
  try {
    issue = detectCompatibility();
  } catch (error) {
    onError('startup', error);
    return false;
  }

  if (issue) {
    onError(issue);
    return false;
  }

  try {
    await loadApplication();
    return true;
  } catch (error) {
    onError('startup', error);
    return false;
  }
}
