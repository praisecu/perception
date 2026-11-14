"""AI for Engineers, short 1: "The winning ticket".

Story: prune 90% of a trained network and it still works; the small network
only trains well from its original starting weights. It won the lottery at
initialisation (Frankle and Carbin, 2019).

Render: manim -qh --format mp4 ai_ticket.py Ticket
"""
import json

import numpy as np

from short_style import *
from short_style import HERE

SHORT = HERE / "out" / "ai4engg" / "01-winning-ticket"
VOICE = json.loads((SHORT / "voice_lines.json").read_text())
L = {int(k): v for k, v in VOICE["start"].items()}
D = {int(k): v for k, v in VOICE["dur"].items()}
END = VOICE["duration"]

LAYERS = [5, 7, 7, 5]
_rng = np.random.default_rng(7)
EDGES = [(li, a, b, abs(_rng.normal()))
         for li in range(len(LAYERS) - 1) for a in range(LAYERS[li]) for b in range(LAYERS[li + 1])]
_w = np.array([e[3] for e in EDGES])
KEEP = set(np.argsort(-_w)[: int(round(0.1 * len(EDGES))) + 1].tolist())
WMAX = _w.max()
BG = "#10110E"


def net(width=7.0, height=4.6, keep_only=False, node_r=0.16, color=INK, edge_color=INK):
    """Network doodle. Edge thickness follows the weight's size."""
    xs = np.linspace(-width / 2, width / 2, len(LAYERS))
    pos = [[np.array([xs[i], y, 0]) for y in np.linspace(height / 2, -height / 2, n)] for i, n in enumerate(LAYERS)]
    edges = VGroup()
    for k, (li, a, b, w) in enumerate(EDGES):
        if keep_only and k not in KEEP:
            continue
        s = w / WMAX
        ln = Line(pos[li][a], pos[li + 1][b]).set_stroke(edge_color, 1.2 + 6 * s, 0.25 + 0.65 * s)
        ln.k = k
        edges.add(ln)
    nodes = VGroup(*[Circle(radius=node_r).set_fill(BG, 1).set_stroke(color, 3).move_to(p) for col in pos for p in col])
    return VGroup(edges, nodes)


def ticket(w=7.4, h=3.8, color=GOLD):
    r = min(0.32, 0.16 * h)
    sw = 5 if h > 2 else 3
    body_ = rough_box(w, h, color, sw, radius=min(0.35, 0.2 * h))
    notch = VGroup(*[Circle(radius=r).set_fill(BG, 1).set_stroke(color, sw).move_to([sx * w / 2, 0, 0]) for sx in (-1, 1)])
    cover = VGroup(*[Rectangle(width=r * 1.15, height=r * 2.6).set_fill(BG, 1).set_stroke(width=0).move_to([sx * (w / 2 + r * 0.58), 0, 0]) for sx in (-1, 1)])
    px = -w / 2 + w * 0.16
    perf = DashedLine([px, h / 2 - 0.1, 0], [px, -h / 2 + 0.1, 0], dash_length=min(0.12, h * 0.08)).set_stroke(color, sw * 0.6, 0.7)
    return VGroup(body_, notch, cover, perf)


def dice(size=1.0):
    sq = RoundedRectangle(width=size, height=size, corner_radius=0.2 * size).set_stroke(INK, 4)
    pips = VGroup(*[Dot(radius=0.07 * size, color=INK).move_to([x * size * 0.27, y * size * 0.27, 0])
                    for x, y in ((-1, 1), (0, 0), (1, -1), (1, 1), (-1, -1))])
    return VGroup(sq, pips)


def rewind(size=1.0, color=GOLD):
    tri = lambda: Triangle().rotate(PI / 2).set_fill(color, 1).set_stroke(width=0).scale(0.32 * size)
    return VGroup(tri(), tri()).arrange(RIGHT, buff=-0.08 * size)


class Ticket(Scene):
    def until(self, t):
        dt = t - self.renderer.time
        if dt > 1 / 30:
            self.wait(dt)
        elif dt < -0.3:
            print(f"[sync] {-dt:.2f} s late for t={t:.2f}")

    def construct(self):
        self.add(grid_bg())
        self.add_foreground_mobject(header_bar())

        # ---------- Cover ----------
        k = kicker("AI for Engineers · Short 1", 30)
        t1 = title("The winning", 104, HEADING)
        t2 = title("ticket", 128, GOLD)
        sub = body("hiding inside every neural network", 38)
        demo = net(6.4, 3.4)
        cov = VGroup(k, t1, t2, sub, demo).arrange(DOWN, buff=0.45).move_to(DOWN * 0.2)
        demo.shift(DOWN * 0.4)
        self.play(FadeIn(k, shift=UP * 0.2), FadeIn(t1, shift=UP * 0.3), FadeIn(t2, shift=UP * 0.3), run_time=0.7)
        self.play(FadeIn(sub, shift=UP * 0.2), Create(demo[0], lag_ratio=0.01), FadeIn(demo[1]), run_time=1.2)
        self.play(*[e.animate.set_stroke(GOLD, opacity=1) for e in demo[0] if e.k in KEEP], run_time=0.8)
        self.until(L[2] - 0.5)
        self.play(FadeOut(cov, shift=UP * 0.3), run_time=0.5)

        # ---------- A trained network ----------
        cap = say("A trained network", 54).move_to(UP * 5.3)
        nn = net().move_to(UP * 0.8)
        hint = mono("every line is a weight", 30, MUTED).next_to(nn, DOWN, buff=0.6)
        self.play(Write(cap), FadeIn(nn[1]), run_time=0.6)
        self.play(Create(nn[0], lag_ratio=0.01), FadeIn(hint, shift=UP * 0.15), run_time=1.3)
        self.until(L[3])

        # ---------- Delete the weakest 90% ----------
        cut = [e for e in nn[0] if e.k not in KEEP]
        big = title("−90%", 150, GOLD).next_to(nn, DOWN, buff=0.5)
        cap2 = say("Delete the weakest", 54).move_to(cap)
        self.play(ReplacementTransform(cap, cap2), FadeOut(hint), *[e.animate.set_stroke(RED, opacity=0.9) for e in cut], run_time=0.6)
        self.play(*[FadeOut(e, shift=DOWN * 0.15) for e in cut], FadeIn(big, scale=0.8), run_time=0.9)
        nn[0].remove(*cut)
        self.until(L[4])

        # ---------- It still works ----------
        self.play(FadeOut(big), nn.animate.scale(0.55).move_to(UP * 4.0), FadeOut(cap2), run_time=0.6)
        base = DOWN * 4.0
        bars = VGroup()
        for i, (hgt, lab, col) in enumerate(((5.0, "full network", INK), (4.8, "10% left", GOLD))):
            b = RoundedRectangle(width=2.0, height=hgt, corner_radius=0.25).set_fill(col, 0.85).set_stroke(col, 3)
            b.move_to(base + RIGHT * (i * 3.2 - 1.6), aligned_edge=DOWN)
            bars.add(VGroup(b, body(lab, 34, INK).next_to(b, DOWN, buff=0.3)))
        acc = mono("accuracy", 32, MUTED).next_to(bars, UP, buff=0.5)
        self.play(FadeIn(acc), *[GrowFromEdge(b[0], DOWN) for b in bars], *[FadeIn(b[1]) for b in bars], run_time=0.9)
        same = pill("almost the same", size=36).next_to(acc, UP, buff=0.35)
        self.play(FadeIn(same, scale=0.85), run_time=0.4)
        self.until(L[4] + 0.5 * D[4])
        q = say("Were they ever needed?", 50, GOLD).next_to(bars, DOWN, buff=1.2)
        self.play(Write(q), run_time=0.7)
        self.until(L[5] - 0.4)

        # ---------- Twist: fresh random start vs original start ----------
        self.play(FadeOut(VGroup(bars, acc, same, q)), nn.animate.scale(0.8).move_to(UP * 4.6), run_time=0.5)
        tw = say("The twist", 54, GOLD).move_to(UP * 2.4)
        self.play(FadeIn(tw, shift=UP * 0.2), run_time=0.4)
        ox, oy, W, H = -3.4, -5.2, 6.8, 5.6
        axes = VGroup(Line([ox, oy, 0], [ox + W, oy, 0]), Line([ox, oy, 0], [ox, oy + H, 0])).set_stroke(INK, 4)
        xl = mono("training →", 28, MUTED).next_to(axes[0], DOWN, buff=0.2).align_to(axes[0], RIGHT)
        yl = mono("accuracy", 28, MUTED).rotate(PI / 2).next_to(axes[1], LEFT, buff=0.2)
        top = DashedLine([ox, oy + H * 0.92, 0], [ox + W, oy + H * 0.92, 0], dash_length=0.15).set_stroke(MUTED, 2, 0.6)
        top_l = mono("big network", 24, MUTED).next_to(top, UP, buff=0.08).align_to(top, RIGHT)
        self.play(FadeOut(tw), Create(axes), FadeIn(xl), FadeIn(yl), Create(top), FadeIn(top_l), run_time=0.7)

        def curve(level, speed, color, width):
            return ParametricFunction(lambda u: np.array([ox + W * u, oy + H * level * (1 - np.exp(-u / speed)), 0]),
                                      t_range=[0, 1]).set_stroke(color, width)

        self.until(L[5] + 0.35 * D[5])
        dc = dice(0.8).move_to([-2.4, 1.6, 0])
        dl = body("fresh random start", 34, INK).next_to(dc, RIGHT, buff=0.35)
        slow = curve(0.66, 0.45, INK, 6)
        self.play(FadeIn(dc, scale=0.7), FadeIn(dl), run_time=0.5)
        self.play(Create(slow), run_time=1.6, rate_func=linear)
        self.until(L[6])
        rw = rewind(1.0).move_to([-2.4, 0.4, 0])
        rl = body("original start", 34, GOLD).next_to(rw, RIGHT, buff=0.35).align_to(dl, LEFT)
        fast = curve(0.92, 0.12, GOLD, 8)
        self.play(FadeIn(rw, scale=0.7), FadeIn(rl), run_time=0.5)
        self.play(Create(fast), run_time=1.6, rate_func=linear)
        self.until(L[7] - 0.4)

        # ---------- The winning ticket ----------
        self.play(FadeOut(VGroup(axes, xl, yl, top, top_l, dc, dl, slow, rw, rl, fast)), run_time=0.5)
        tk = ticket().move_to(UP * 0.6)
        tk_lab = hand("winning ticket", 64, GOLD).next_to(tk, UP, buff=0.5)
        self.play(Create(tk[0]), FadeIn(tk[1:]), nn.animate.scale(1.05).move_to(tk.get_center() + RIGHT * 0.5), run_time=0.9)
        self.play(Write(tk_lab), nn[0].animate.set_stroke(GOLD), run_time=0.8)
        when = body("chosen before training began", 36, INK).next_to(tk, DOWN, buff=0.6)
        self.play(FadeIn(when, shift=UP * 0.2), run_time=0.5)
        self.until(L[8] - 0.4)

        # ---------- A pile of tickets ----------
        win = VGroup(tk, nn)
        grid = VGroup(*[ticket(1.25, 0.72, MUTED) for _ in range(30)]).arrange_in_grid(6, 5, buff=(0.35, 0.4)).move_to(DOWN * 0.2)
        gi = 17
        self.play(FadeOut(VGroup(tk_lab, when)), win.animate.scale_to_fit_width(1.25).move_to(grid[gi]), run_time=0.8)
        self.remove(grid[gi])
        self.play(LaggedStart(*[FadeIn(g, scale=0.8) for i, g in enumerate(grid) if i != gi], lag_ratio=0.03), run_time=1.0)
        cap8 = say("Training finds the winner.", 52).move_to(UP * 5.0)
        self.play(Write(cap8), Indicate(win, color=GOLD, scale_factor=1.3), run_time=0.9)
        self.until(L[9] - 0.4)

        # ---------- Why it matters ----------
        self.play(FadeOut(VGroup(grid, cap8)), FadeOut(win), run_time=0.5)
        dr = drone_doodle(1.6).move_to(DOWN * 0.4)
        tiny = net(2.6, 1.6, keep_only=True, node_r=0.09, edge_color=GOLD).move_to(UP * 3.3)
        link = DashedLine(tiny.get_bottom() + DOWN * 0.1, dr.get_top() + UP * 0.1, dash_length=0.12).set_stroke(GOLD, 3)
        pills = VGroup(pill("smaller", size=36), pill("faster", size=36), pill("cheaper", size=36)).arrange(RIGHT, buff=0.3).move_to(DOWN * 3.2)
        cap9 = say("Small enough to fly", 54).move_to(UP * 5.6)
        self.play(Write(cap9), FadeIn(dr, shift=UP * 0.3), run_time=0.8)
        self.play(FadeIn(tiny), Create(link), run_time=0.6)
        self.play(LaggedStart(*[FadeIn(p, shift=UP * 0.2) for p in pills], lag_ratio=0.3), dr.animate.shift(UP * 0.3), run_time=1.0)
        self.until(L[10] - 0.4)

        # ---------- End card ----------
        self.play(FadeOut(VGroup(dr, tiny, link, pills, cap9)), run_time=0.5)
        e0 = kicker("PRAISe Lab · Shorts", 30)
        e1 = title("AI for", 96, HEADING)
        e2 = title("Engineers", 110, GOLD)
        rule = Line(LEFT * 1.6, RIGHT * 1.6).set_stroke(GOLD, 3, 0.6)
        e3 = body("Big ideas in under a minute", 40, BODY)
        e4 = pill("Follow for more", size=38)
        end = VGroup(e0, e1, e2, rule, e3, e4).arrange(DOWN, buff=0.4).move_to(DOWN * 0.2)
        rule.shift(DOWN * 0.1); e3.shift(DOWN * 0.15); e4.shift(DOWN * 0.45)
        self.play(FadeIn(e0, shift=UP * 0.2), FadeIn(VGroup(e1, e2), shift=UP * 0.3), run_time=0.7)
        self.play(Create(rule), FadeIn(e3, shift=UP * 0.2), run_time=0.5)
        self.play(FadeIn(e4, shift=UP * 0.2), run_time=0.5)
        self.until(END)
