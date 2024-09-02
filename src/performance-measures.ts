import { Actor } from 'apify';

/**
 * Compute average time for each time measure event
 */

// const datasetId = 'aDnsnaBqGb8eTdpGv'; // 2GB, maxResults=1
// const datasetId = 'giAPLL8dhd2PDqPlf'; // 2GB, maxResults=5
// const datasetId = 'VKzel6raVqisgIYfe'; // 4GB, maxResults=1
const datasetId = 'fm9tO0GDBUagMT0df'; // 4GB, maxResults=5

// set environment variables APIFY_TOKEN
process.env.APIFY_TOKEN = 'apify_api_IoPOM26vW1hV4tqum7jVYsoFvm0UZt4iEOPH';

const dataset = await Actor.openDataset(datasetId, { forceCloud: true });
const remoteDataset = await dataset.getData();

const timeMeasuresMap = new Map<string, number[]>();
const timeMeasuresTimeTaken = [];

// compute average time for the timeMeasures
for (const item of remoteDataset.items) {
    const { timeMeasures } = item.crawl.debug;

    for (const measure of timeMeasures) {
        if (!timeMeasuresMap.has(measure.event)) {
            timeMeasuresMap.set(measure.event, []);
        }
        timeMeasuresMap.set(measure.event, [...timeMeasuresMap.get(measure.event)!, measure.timeDeltaPrevMs]);

        if (measure.event === 'playwright-before-response-send') {
            timeMeasuresTimeTaken.push(measure.timeMs);
        }
    }
}
// eslint-disable-next-line no-console
console.log('Average time for each time measure event:', timeMeasuresMap);

for (const [key, value] of timeMeasuresMap) {
    const sum = value.reduce((a, b) => a + b, 0);
    const avg = sum / value.length;
    // eslint-disable-next-line no-console
    console.log(`${key}: ${avg.toFixed(0)} s`);
}

// eslint-disable-next-line no-console
console.log('Time taken for each request:', timeMeasuresTimeTaken);
// eslint-disable-next-line no-console
console.log('Time taken on average', timeMeasuresTimeTaken.reduce((a, b) => a + b, 0) / timeMeasuresTimeTaken.length);
