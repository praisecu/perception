# Short 1.2: Why is seeing so hard?

**Format:** vertical 1080 × 1920, about 35 s, one idea.
**Idea:** an image throws information away, so the same picture can come from many different worlds. Perception has to fill in what's missing.

The video will be retimed to the recorded voice, so read naturally; times are targets.

| # | Target | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00 | Cover: "Why is seeing so hard?" | Seeing feels effortless. For a robot, it's one of the hardest problems there is. |
| 2 | 0:04 | Camera with a cone of rays | Here's why. Every pixel only tells you which direction the light came from, not how far it travelled. |
| 3 | 0:09 | A small drone near, a big drone far, in the same cone | So a small drone up close and a big drone far away can land on exactly the same pixels. |
| 4 | 0:14 | Render: two drones that look identical | These two look the same size. |
| 5 | 0:16 | Top view: 0.5 m at 2 m, 1.5 m at 6 m | They're not. One is three times bigger, and three times farther away. |
| 6 | 0:21 | Same drone, bright and dim, with pixel values | Now dim the lights. Same drone, same place, but every number in the image changes. |
| 7 | 0:27 | A cube flattens into a square | And every photo is flat. The camera squashes a 3D world into 2D, and depth is gone. |
| 8 | 0:32 | "So the image is only a clue." | So an image isn't the answer. It's a clue, and perception is the art of reading it. |
| 9 | 0:37 | End card | Fundamentals of Robot Perception. Chapter one. |

## Fact check

- **Rays.** In the pinhole model each pixel back-projects to a ray. Depth along that ray is not measured by a single image.
- **Forced perspective.** The drones in the render are 0.5 m wide at 2 m and 1.5 m wide at 6 m. The same ratio of size to distance gives the same image size.
- **Lighting.** The bright and dim patches are the same render scaled by 1.35 and 0.38, so every value changes while the scene does not.
- **Depth is gone.** It's lost from one image. It can be recovered with more views (stereo, motion), known sizes, or learned priors, which later chapters cover.
