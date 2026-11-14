# AI for Engineers, Short 1: The winning ticket

**Format:** vertical 1080 × 1920, about 50 s, one idea.
**Idea:** a big trained network hides a small subnetwork that could have done the job alone, but only from its original starting weights. Training a big network is like buying many lottery tickets.
**Shape:** strange claim, prune, it still works, twist (re-init fails, rewind works), the name, the intuition, why it matters, sign-off.

| # | Time | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00 | Cover: "The winning ticket inside every network" | Here's a strange fact about neural networks. Most of what you train is just along for the ride. |
| 2 | 0:05 | A dense network doodle; edge thickness is weight size | Take a trained network with millions of connections. |
| 3 | 0:08 | The thinnest 90% of edges snap away; "−90%" | Now delete the weakest ninety percent of them. |
| 4 | 0:11 | Two accuracy bars, nearly equal | It still works almost as well. So were those weights ever needed? |
| 5 | 0:16 | Small network, dice: "fresh random start"; a slow, low training curve | Here's the twist. Train that small network again from fresh random weights, and it struggles. |
| 6 | 0:22 | Rewind icon: "original start"; a fast, high curve | But give it back the exact starting weights it had on day one, and it learns as well as the big network. |
| 7 | 0:29 | A ticket with the small network on it: "winning ticket" | That subnetwork won the lottery before training even began. Researchers call it a winning ticket. |
| 8 | 0:35 | A grid of tickets, one glows gold | A big network is a huge pile of lottery tickets, and training finds the winner. |
| 9 | 0:40 | Drone doodle with a tiny network; "smaller · faster · cheaper" | Find the winner early, and AI gets small and cheap enough to fly on a tiny drone. |
| 10 | 0:46 | End card: AI for Engineers, PRAISe Lab | Follow for more AI, explained in under a minute. |

## Fact check

- **Source.** Frankle and Carbin, "The Lottery Ticket Hypothesis: Finding Sparse, Trainable Neural Networks", ICLR 2019 (best paper).
- **How the ticket is found.** Train, prune the smallest-magnitude weights, reset the survivors to their original initial values, and repeat (iterative magnitude pruning).
- **90% and "as well".** On MNIST and CIFAR-10 networks they found tickets at 10 to 20% of the original size, often less, that matched the full network's accuracy.
- **Fresh random start struggles.** The same sparse structure re-initialised at random learned more slowly and reached lower accuracy.
- **Caveat.** For large networks, resetting to the very first weights works less well; resetting to weights from early in training ("rewinding", Frankle et al. 2020) is needed. The curves in the video are illustrative.
