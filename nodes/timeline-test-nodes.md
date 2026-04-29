# Timeline Test Nodes

Synthetic timeline nodes were added to exercise temporal filtering across multiple dates and times.

- The added files use the `nodes/timeline-signal-*.md` naming pattern.
- Their markdown frontmatter date headers were removed so content metadata does not drive timestamps.
- File modification times were varied across Apr 22-May 3 with distinct hours and minutes.
- The timeline notes link to each other and to existing graph concept nodes, creating a navigable test sequence.
- These files are useful for validating collapsed `All time`, fixed bucket filtering, span filtering, and camera refitting.

This test data depends on the [[Time Metadata Source Decision]] and validates [[Smart Time Bucket Filtering]].
