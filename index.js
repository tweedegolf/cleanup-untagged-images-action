const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  const packageName = core.getInput('package');
  const olderThan = core.getInput('older_than');
  const untaggedTsTolerance = core.getInput('untagged_timestamp_tolerance');
  const owner = github.context.repo.owner;
  const token = core.getInput('token');

  const olderThanTime = new Date();
  olderThanTime.setDate(olderThanTime.getDate() - olderThan);

  const octokit = github.getOctokit(token);
  const containerImages = await octokit.paginate(octokit.rest.packages.getAllPackageVersionsForPackageOwnedByOrg, {
      package_type: 'container',
      package_name: packageName,
      org: owner,
      per_page: 100,
  });
  const taggedImages = containerImages.filter(p => (p.metadata?.container?.tags ?? []).length > 0);
  const untaggedItems = containerImages.filter(p => {
      // check that images are old enough
      const pCreated = new Date(p.created_at);
      if (olderThan > 0) {
        if (pCreated >= olderThanTime) {
          return false;
        }
      }

      // check that images are not too close to tagged images
      if (untaggedTsTolerance < 0) {
        return true;
      } else {
        return !taggedImages.some(t => Math.abs((new Date(t.created_at)).getTime() - pCreated.getTime()) < untaggedTsTolerance);
      }
  });

  console.log(`Found ${untaggedItems.length} untagged images no longer necessary`);
  for (const untagged of untaggedItems) {
      await octokit.rest.packages.deletePackageVersionForOrg({
          package_type: 'container',
          package_name: packageName,
          org: owner,
          package_version_id: untagged.id,
      });
      console.log(`Deleted untagged container image '${untagged.name}'`);
  }
}

run().catch((e) => core.setFailed(e.message));
