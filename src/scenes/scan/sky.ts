/**
 * The one sky every scene shares: Poly Haven `syferfontein_18d_clear_puresky` (CC0), a photographed
 * cloudless sky with the sun 18 degrees up and the land already removed. scripts/build-sky.py rebuilds
 * it: the horizon's haze line is graded out and the lower hemisphere is the sky mirrored, so there is
 * no land and no cloud anywhere in it. Each scene passes it to ScanScene as its `hdri`: the background
 * and the image-based light.
 */
export const SHARED_SKY = '/scans/hdri/clear-sky.webp'
