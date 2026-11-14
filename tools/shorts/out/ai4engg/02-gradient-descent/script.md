# AI for Engineers, Short 2: Downhill, blindfolded

**Format:** vertical 1080 × 1920, about 55 s, one idea.
**Idea:** a network learns by feeling the slope of its error where it stands and stepping downhill, again and again. That is gradient descent.
**Shape:** hook, the landscape, the blindfold, the slope, the steps, seen from above, the one-line rule, the step-size teaser, sign-off.

| # | Time | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00 | Cover: "How networks learn" | How does a neural network learn? By walking downhill, blindfolded. |
| 2 | 0:05 | A hand-drawn error curve: weight across, error up | Picture every setting of the network's weights as a landscape. The height is the error. |
| 3 | 0:11 | The curve fades except near a gold ball; "goal" at the deepest valley | Learning means finding the lowest valley. But the network can't see the map. |
| 4 | 0:16 | A tangent line at the ball; "slope = gradient" | It can only feel the slope right where it stands. That slope is the gradient. |
| 5 | 0:21 | The ball steps downhill, the tangent updating each step | So it takes a small step downhill, feels the slope again, and repeats. |
| 6 | 0:27 | Contour map seen from above; steps cross the contour lines | Seen from above, every step points across the contour lines, toward lower ground. |
| 7 | 0:33 | The rule: new w = w − step size × gradient | In math, it's one line. New weights equal old weights, minus a step size times the gradient. |
| 8 | 0:40 | Two panels: tiny steps crawl; big steps bounce out | Too small a step, and it crawls. Too big, and it overshoots the valley. |
| 9 | 0:46 | Many weights, all nudged at once | Every weight in the network gets nudged downhill together, step after step. That's learning. |
| 10 | 0:52 | End card: AI for Engineers, PRAISe Lab | Follow for more AI, explained in under a minute. |

## Fact check

- **Update rule.** Gradient descent: w ← w − η ∇L(w), where η is the learning rate (step size) and ∇L is the gradient of the loss.
- **Across the contour lines.** The gradient is perpendicular to the level sets of the loss, so each plain gradient step crosses the contours at right angles.
- **Step size.** Too small a learning rate converges slowly; too large overshoots and can diverge (lecture 7).
- **Simplifications.** Real training uses mini-batches (stochastic gradient descent) and optimisers such as momentum and Adam (lectures 9 and 10). Real loss landscapes have millions of dimensions; the curves here are 1D and 2D sketches.
