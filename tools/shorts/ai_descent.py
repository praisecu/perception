"""AI for Engineers, short 2: "Downhill, blindfolded" (gradient descent).

Render: manim -qh --format mp4 ai_descent.py Descent
"""
import json

import numpy as np

from short_style import *
from short_style import HERE

SHORT = HERE / "out" / "ai4engg" / "02-gradient-descent"
VOICE = json.loads((SHORT / "voice_lines.json").read_text())
L = {int(k): v for k, v in VOICE["start"].items()}
D = {int(k): v for k, v in VOICE["dur"].items()}
END = VOICE["duration"]
BG = "#10110E"


def f(x):
    return 0.16 * (x - 0.9) ** 2 + 0.35 * np.sin(2.2 * x) + 0.6


def df(x):
    return 0.32 * (x - 0.9) + 0.77 * np.cos(2.2 * x)


SX, Y0, SY = 1.15, -2.6, 1.55     # screen mapping of the 1D landscape
X_MIN = 1.9396                    # global minimum


def P(x):
    return np.array([x * SX, Y0 + f(x) * SY, 0])


def landscape(x0=-3.6, x1=3.6, color=INK, width=6):
    return ParametricFunction(P, t_range=[x0, x1]).set_stroke(color, width)


def ball(x, r=0.2):
    n = np.array([-df(x) * SY, SX, 0]); n /= np.linalg.norm(n)
    return Circle(radius=r).set_fill(GOLD, 1).set_stroke(INK, 3).move_to(P(x) + n * (r + 0.03))


def tangent(x, half=1.3):
    d = np.array([SX, df(x) * SY, 0]); d /= np.linalg.norm(d)
    return Line(P(x) - d * half, P(x) + d * half).set_stroke(BLUE, 5)


class Descent(Scene):
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
        k = kicker("AI for Engineers · Short 2", 30)
        t1 = fit(title("How networks", 96, HEADING), 8.2)
        t2 = title("learn", 140, GOLD)
        sub = body("by walking downhill, blindfolded", 40)
        mini = VGroup(landscape(color=INK, width=5), ball(-2.6, 0.18)).scale(0.8)
        cov = VGroup(k, t1, t2, sub, mini).arrange(DOWN, buff=0.45).move_to(DOWN * 0.3)
        mini.shift(DOWN * 0.5)
        self.play(FadeIn(k, shift=UP * 0.2), FadeIn(t1, shift=UP * 0.3), FadeIn(t2, shift=UP * 0.3), run_time=0.7)
        self.play(FadeIn(sub, shift=UP * 0.2), Create(mini[0]), FadeIn(mini[1], scale=0.5), run_time=1.0)
        self.until(L[2] - 0.5)
        self.play(FadeOut(cov, shift=UP * 0.3), run_time=0.5)

        # ---------- The landscape ----------
        cap = say("The error landscape", 54).move_to(UP * 5.4)
        ax = VGroup(Line([-4.3, Y0 - 0.2, 0], [4.3, Y0 - 0.2, 0]), Line([-4.3, Y0 - 0.2, 0], [-4.3, Y0 + 5.6, 0])).set_stroke(MUTED, 3)
        xl = mono("weight →", 28, MUTED).next_to(ax[0], DOWN, buff=0.2).align_to(ax[0], RIGHT)
        yl = mono("error →", 28, MUTED).rotate(PI / 2).next_to(ax[1], RIGHT, buff=0.15).align_to(ax[1], UP)
        curve = landscape()
        self.play(Write(cap), Create(ax), FadeIn(xl), FadeIn(yl), run_time=0.8)
        self.play(Create(curve), run_time=1.6)
        self.until(L[3])

        # ---------- Blindfolded ----------
        goal = VGroup(Triangle().scale(0.16).rotate(PI).set_fill(GOLD, 1).set_stroke(width=0),
                      mono("lowest error", 26, GOLD)).arrange(UP, buff=0.12).next_to(P(X_MIN), DOWN, buff=0.35)
        x = ValueTracker(3.4)
        b = always_redraw(lambda: ball(x.get_value()))
        cap3 = say("Find the lowest valley", 54).move_to(cap)
        self.play(ReplacementTransform(cap, cap3), FadeIn(goal, shift=UP * 0.2), FadeIn(b, scale=0.5), run_time=0.7)
        self.until(L[3] + 0.55 * D[3])
        x_now = 3.4
        seen = landscape(x_now - 0.7, min(3.6, x_now + 0.7), INK, 6)
        blind = hand("but it can't see the map", 50, GOLD).move_to(UP * 4.3)
        self.play(curve.animate.set_stroke(opacity=0.12), FadeIn(seen), FadeOut(goal), Write(blind), run_time=0.9)
        self.until(L[4])

        # ---------- Feel the slope ----------
        tg = always_redraw(lambda: tangent(x.get_value()))
        sl = pill("slope = gradient", size=36).move_to(UP * 2.9)
        self.play(FadeOut(blind), Create(tg), FadeIn(sl, scale=0.85), run_time=0.7)
        arr = Arrow(P(3.4) + UP * 0.7, P(3.4) + UP * 0.7 + LEFT * 1.3, buff=0, color=GOLD, stroke_width=7)
        dl = body("downhill", 32, GOLD).next_to(arr, UP, buff=0.12)
        self.play(GrowArrow(arr), FadeIn(dl), run_time=0.6)
        self.until(L[5])

        # ---------- Step, feel, repeat ----------
        cap5 = say("Step. Feel. Repeat.", 56).move_to(cap3)
        self.play(FadeOut(VGroup(arr, dl)), ReplacementTransform(cap3, cap5), run_time=0.4)
        trail = VGroup()
        xv = 3.4
        for i in range(7):
            nx = xv - 0.35 * df(xv)
            dot = Dot(P(xv), radius=0.07, color=GOLD)
            trail.add(dot)
            self.add(dot)
            win = landscape(max(-3.6, nx - 0.7), min(3.6, nx + 0.7), INK, 6)
            self.play(x.animate.set_value(nx), Transform(seen, win), run_time=0.55 if i < 4 else 0.35)
            xv = nx
        self.play(curve.animate.set_stroke(opacity=1), FadeIn(goal), run_time=0.6)
        self.until(L[6] - 0.4)

        # ---------- Seen from above ----------
        b.clear_updaters(); tg.clear_updaters()
        self.play(FadeOut(VGroup(ax, xl, yl, curve, seen, b, tg, sl, trail, goal, cap5)), run_time=0.5)
        cap6 = say("Seen from above", 54).move_to(UP * 5.4)
        c0 = DOWN * 0.6
        A, Bq, S = 1.0, 5.0, 1.2
        rings = VGroup()
        for lev in (0.15, 0.6, 1.4, 2.6, 4.2, 6.2):
            rings.add(Ellipse(width=2 * np.sqrt(2 * lev / A) * S, height=2 * np.sqrt(2 * lev / Bq) * S)
                      .move_to(c0).set_stroke(INK, 3, 0.35 + 0.1 * (lev < 1)))
        low = Dot(c0, radius=0.09, color=GOLD)
        self.play(Write(cap6), LaggedStart(*[Create(r) for r in rings[::-1]], lag_ratio=0.12), FadeIn(low), run_time=1.3)
        u, v = -3.3, 0.95
        pts = [np.array([u, v])]
        for _ in range(8):
            u, v = u - 0.3 * A * u, v - 0.3 * Bq * v
            pts.append(np.array([u, v]))
        pos = [c0 + np.array([p[0], p[1], 0]) * S for p in pts]
        dot0 = Dot(pos[0], radius=0.16, color=GOLD).set_stroke(INK, 2)
        self.play(FadeIn(dot0, scale=0.5), run_time=0.3)
        steps = VGroup()
        for a_, b_ in zip(pos[:-1], pos[1:]):
            ar = Arrow(a_, b_, buff=0.05, color=GOLD, stroke_width=5, max_tip_length_to_length_ratio=0.25)
            steps.add(ar)
            self.play(GrowArrow(ar), dot0.animate.move_to(b_), run_time=0.35)
        note = body("each step crosses the lines at a right angle", 34, INK)
        fit(note, 8.4).move_to(DOWN * 4.2)
        self.play(FadeIn(note, shift=UP * 0.2), run_time=0.5)
        self.until(L[7] - 0.4)

        # ---------- The rule ----------
        self.play(FadeOut(VGroup(rings, low, steps, dot0, note, cap6)), run_time=0.5)
        cap7 = say("The whole rule", 54).move_to(UP * 5.0)
        r1 = VGroup(title("new w", 84, GOLD), title("=", 84, INK), title("w", 84, INK), title("−", 84, INK))
        r1.arrange(RIGHT, buff=0.35)
        r2 = VGroup(title("step", 84, BLUE), title("×", 84, INK), title("gradient", 84, BLUE)).arrange(RIGHT, buff=0.35)
        rule = VGroup(r1, r2).arrange(DOWN, buff=0.45).move_to(UP * 1.4)
        fit(rule, 8.4)
        sym = mono("w ← w − η · dL/dw", 40, MUTED).next_to(rule, DOWN, buff=0.8)
        lab_s = body("how far to step", 32, BLUE).next_to(r2[0], DOWN, buff=0.25)
        lab_g = body("which way is up", 32, BLUE).next_to(r2[2], DOWN, buff=0.25)
        self.play(Write(cap7), run_time=0.5)
        self.play(LaggedStart(*[FadeIn(m, shift=UP * 0.2) for m in [*r1, *r2]], lag_ratio=0.12), run_time=1.4)
        self.play(FadeIn(lab_s), FadeIn(lab_g), run_time=0.5)
        self.play(VGroup(lab_s, lab_g).animate.shift(DOWN * 0.0), FadeIn(sym.next_to(VGroup(lab_s, lab_g), DOWN, buff=0.7)), run_time=0.5)
        self.until(L[8] - 0.4)

        # ---------- Step size ----------
        self.play(FadeOut(VGroup(cap7, rule, sym, lab_s, lab_g)), run_time=0.5)
        cap8 = say("Step size matters", 54).move_to(UP * 5.4)

        def bowl(cx, cy):
            return ParametricFunction(lambda t: np.array([cx + t, cy + 0.32 * t * t, 0]), t_range=[-2.0, 2.0]).set_stroke(INK, 5)

        def walk(cx, cy, lr, n, start=-1.8):
            t, pts = start, []
            for _ in range(n):
                pts.append(np.array([cx + t, cy + 0.32 * t * t, 0]))
                t = t - lr * 0.64 * t
            return pts

        lb, rb = bowl(-2.2, 0.0), bowl(2.2, 0.0)
        ll = body("too small: crawls", 34, INK).move_to([-2.2, -1.2, 0])
        rl = body("too big: overshoots", 34, GOLD).move_to([2.2, -1.2, 0])
        self.play(Write(cap8), Create(lb), Create(rb), FadeIn(ll), FadeIn(rl), run_time=0.9)
        pl = walk(-2.2, 0.0, 0.08, 10)
        pr = walk(2.2, 0.0, 3.4, 5, start=-0.5)
        bl = Dot(pl[0], radius=0.14, color=GOLD).set_stroke(INK, 2)
        br = Dot(pr[0], radius=0.14, color=GOLD).set_stroke(INK, 2)
        self.play(FadeIn(bl), FadeIn(br), run_time=0.3)
        for i in range(1, 6):
            anims = [bl.animate.move_to(pl[min(i, len(pl) - 1)])]
            if i < len(pr):
                anims.append(br.animate.move_to(pr[i]))
                self.add(Line(pr[i - 1], pr[i]).set_stroke(GOLD, 2, 0.6))
            self.play(*anims, run_time=0.4)
        self.until(L[9] - 0.4)

        # ---------- All weights at once ----------
        self.clear(); self.add(grid_bg()); self.add_foreground_mobject(header_bar())
        cap9 = say("Every weight, nudged together", 50).move_to(UP * 5.4)
        fit(cap9, 8.4)
        rng = np.random.default_rng(3)
        sliders = VGroup()
        knobs = []
        for r in range(6):
            for c in range(4):
                tr = Line(LEFT * 0.8, RIGHT * 0.8).set_stroke(MUTED, 4)
                kn = Circle(radius=0.13).set_fill(GOLD, 1).set_stroke(INK, 2).move_to(tr.point_from_proportion(rng.uniform(0.2, 0.8)))
                sliders.add(VGroup(tr, kn)); knobs.append(kn)
        sliders.arrange_in_grid(6, 4, buff=(0.5, 0.55)).move_to(UP * 0.6)
        self.play(Write(cap9), LaggedStart(*[FadeIn(s) for s in sliders], lag_ratio=0.02), run_time=1.0)
        for _ in range(3):
            self.play(*[kn.animate.shift(RIGHT * rng.uniform(-0.25, 0.25)) for kn in knobs], run_time=0.5)
        fin = hand("That's learning.", 76, GOLD).move_to(DOWN * 4.0)
        self.play(Write(fin), run_time=0.8)
        self.until(L[10] - 0.4)

        # ---------- End card ----------
        self.play(FadeOut(VGroup(cap9, sliders, fin)), run_time=0.5)
        e0 = kicker("PRAISe Lab · Shorts", 30)
        e1 = title("AI for", 96, HEADING)
        e2 = title("Engineers", 110, GOLD)
        rule_ = Line(LEFT * 1.6, RIGHT * 1.6).set_stroke(GOLD, 3, 0.6)
        e3 = body("Next: how big should each step be?", 38, BODY)
        e4 = pill("Follow for more", size=38)
        end = VGroup(e0, e1, e2, rule_, e3, e4).arrange(DOWN, buff=0.4).move_to(DOWN * 0.2)
        rule_.shift(DOWN * 0.1); e3.shift(DOWN * 0.15); e4.shift(DOWN * 0.45)
        self.play(FadeIn(e0, shift=UP * 0.2), FadeIn(VGroup(e1, e2), shift=UP * 0.3), run_time=0.7)
        self.play(Create(rule_), FadeIn(e3, shift=UP * 0.2), run_time=0.5)
        self.play(FadeIn(e4, shift=UP * 0.2), run_time=0.5)
        self.until(END)
