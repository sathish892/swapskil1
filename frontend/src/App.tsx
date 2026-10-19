import { useEffect, useState } from "react";
import { AccountPage } from "./auth/AccountPage";
import { LoginPage } from "./auth/LoginPage";
import { RegistrationPage } from "./auth/RegistrationPage";
import { MySkillsPage } from "./workspace/MySkillsPage";
import { ProfilePage } from "./workspace/ProfilePage";
import { ExplorePage } from "./workspace/ExplorePage";
import { RequestsPage } from "./workspace/RequestsPage";
import { PublicProfilePage } from "./workspace/PublicProfilePage";
import { SessionsPage } from "./workspace/SessionsPage";
import { MessagesPage } from "./workspace/MessagesPage";
import { LearningRoomsPage } from "./workspace/LearningRoomsPage";
import { MeetingRoomPage } from "./workspace/MeetingRoomPage";
import { AdminDashboardPage } from "./workspace/AdminDashboardPage";
import { StudentRankingsPage } from "./workspace/StudentRankingsPage";
import { RoadmapPage } from "./workspace/RoadmapPage";
import { getSafeReturnPath, type PublicUser } from "./auth/types";
import { Icon, type IconName } from "./components/Icon";
import { Navbar } from "./components/Navbar";
import { SectionHeading } from "./components/SectionHeading";
import { AboutPage } from "./AboutPage";

const skills: {
  title: string;
  description: string;
  icon: IconName;
  color: string;
  tag: string;
}[] = [
  { title: "Web development", description: "Build the web, one project and one new idea at a time.", icon: "code", color: "bg-[#e4f0dc] text-[#355f43]", tag: "Build" },
  { title: "Python programming", description: "Turn curious questions into useful little programs.", icon: "python", color: "bg-[#fff0c8] text-[#8b6216]", tag: "Code" },
  { title: "UI/UX design", description: "Make digital experiences feel intuitive and human.", icon: "design", color: "bg-[#e8e2f8] text-[#64518b]", tag: "Create" },
  { title: "Graphic design", description: "Bring ideas to life with color, type, and a point of view.", icon: "brush", color: "bg-[#fce3df] text-[#9d574f]", tag: "Create" },
  { title: "Video editing", description: "Shape raw moments into stories worth watching.", icon: "video", color: "bg-[#dcedf2] text-[#416d7b]", tag: "Tell stories" },
  { title: "Digital marketing", description: "Help good ideas find the people who need them.", icon: "megaphone", color: "bg-[#f4e3ce] text-[#8e6235]", tag: "Grow" },
];

const steps: { number: string; title: string; description: string; icon: IconName; tone: string }[] = [
  { number: "01", title: "Create your profile", description: "Introduce yourself and let fellow students know what you enjoy learning and sharing.", icon: "bulb", tone: "bg-[#e6f0df] text-forest" },
  { number: "02", title: "Share skills both ways", description: "List a skill you’d be happy to teach and something you’d love to learn next.", icon: "book", tone: "bg-[#f7e9cf] text-[#8e6235]" },
  { number: "03", title: "Connect and exchange", description: "Meet a fellow student and trade time, ideas, and hands-on practice.", icon: "people", tone: "bg-[#e9e3f6] text-[#65528e]" },
];

const reasons: { title: string; description: string; icon: IconName }[] = [
  { title: "Learn peer to peer", description: "Get a fresh perspective from someone learning and building right alongside you.", icon: "people" },
  { title: "Practice as you go", description: "Turn a new concept into something tangible through small, shared projects.", icon: "brush" },
  { title: "Give knowledge a second life", description: "Teaching a skill helps someone else move forward—and helps you see it in a new way.", icon: "heart" },
  { title: "Find your people", description: "Meet curious students who are happy to swap notes, ideas, and encouragement.", icon: "sparkles" },
];

const studentBenefits = [
  "Learn without a required subscription fee",
  "Teach skills you already know",
  "Build confidence through practice",
  "Collaborate with fellow students",
  "Grow your portfolio with learning projects",
];

function ArrowLink({ href, children, light = false }: { href: string; children: React.ReactNode; light?: boolean }) {
  return (
    <a
      href={href}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime ${light ? "bg-lime text-forest hover:bg-white" : "bg-forest text-white hover:bg-emerald-950 hover:shadow-lg hover:shadow-forest/20"}`}
    >
      {children}
      <Icon name="arrow-up-right" className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

function HeroArtwork() {
  return (
    <div className="hero-art relative mx-auto aspect-[1.08/1] w-full max-w-[570px]" role="img" aria-label="Illustration of two students sharing ideas and learning together">
      <div className="absolute inset-[6%_5%_5%_8%] overflow-hidden rounded-[2.5rem] bg-[#dce8c7] sm:rounded-[3rem]">
        <div className="absolute -right-[7%] -top-[11%] size-[61%] rounded-full bg-[#f3b766]" />
        <div className="absolute -bottom-[17%] -left-[10%] size-[62%] rounded-full bg-[#9bb796]" />
        <div className="absolute left-[15%] top-[15%] size-3 rounded-full bg-white/90" />
        <div className="absolute left-[23%] top-[11%] size-2 rounded-full bg-[#f3b766]" />
        <div className="absolute bottom-[15%] right-[13%] size-2 rounded-full bg-white" />

        <div className="absolute left-[8%] top-[13%] z-10 w-[44%] rotate-[-4deg] rounded-2xl border border-white/75 bg-white/95 p-3 shadow-xl shadow-forest/10 sm:rounded-3xl sm:p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e9e3f6] text-[#65528e] sm:size-11">
              <Icon name="design" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400 sm:text-[10px]">Happy to share</span>
              <span className="mt-1 block truncate text-xs font-semibold text-ink sm:text-sm">A little design thinking</span>
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="h-1.5 w-1/3 rounded-full bg-[#d7cbed]" />
            <span className="h-1.5 w-1/4 rounded-full bg-[#f4dfb9]" />
            <span className="h-1.5 w-1/5 rounded-full bg-[#dce8c7]" />
          </div>
        </div>

        <div className="absolute bottom-[12%] right-[7%] z-20 w-[49%] rotate-[4deg] rounded-2xl border border-white/75 bg-white/95 p-3 shadow-xl shadow-forest/10 sm:rounded-3xl sm:p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff0c8] text-[#8b6216] sm:size-11">
              <Icon name="code" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400 sm:text-[10px]">Curious about</span>
              <span className="mt-1 block truncate text-xs font-semibold text-ink sm:text-sm">Making my first website</span>
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="flex -space-x-1.5">
              <span className="size-5 rounded-full border-2 border-white bg-[#c77f65] sm:size-6" />
              <span className="size-5 rounded-full border-2 border-white bg-[#718a70] sm:size-6" />
              <span className="size-5 rounded-full border-2 border-white bg-[#d7b16f] sm:size-6" />
            </span>
            <span className="text-[10px] font-semibold text-emerald-800 sm:text-xs">Better, together <span aria-hidden="true">↗</span></span>
          </div>
        </div>

        <div className="absolute left-[42%] top-[42%] z-10 grid size-[27%] place-items-center rounded-full border-[5px] border-white/80 bg-forest text-lime shadow-2xl shadow-forest/25 sm:border-[7px]">
          <Icon name="swap" className="size-[45%]" />
        </div>

        <div className="absolute bottom-[9%] left-[13%] z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-semibold text-forest shadow-sm backdrop-blur-sm sm:text-xs">
          <Icon name="sparkles" className="size-4" /> Skills go both ways
        </div>
      </div>
      <div className="absolute right-[2%] top-[17%] -rotate-12 text-[#9cad7d]"><Icon name="sparkles" className="size-9 sm:size-12" /></div>
      <div className="absolute bottom-[9%] left-[3%] rotate-6 text-[#dda45b]"><Icon name="sparkles" className="size-7 sm:size-9" /></div>
    </div>
  );
}

function SkillCard({ skill, index }: { skill: (typeof skills)[number]; index: number }) {
  return (
    <article className="group rounded-[1.5rem] border border-ink/8 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-900/20 hover:shadow-xl hover:shadow-forest/5 sm:p-6">
      <div className="flex items-start justify-between">
        <span className={`grid size-12 place-items-center rounded-2xl ${skill.color} transition-transform duration-300 group-hover:rotate-[-5deg] group-hover:scale-105`}>
          <Icon name={skill.icon} className="size-6" />
        </span>
        <span className="font-display text-sm font-semibold tracking-wide text-slate-300">0{index + 1}</span>
      </div>
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">{skill.tag}</p>
      <h3 className="font-display text-xl font-semibold tracking-[-0.035em] text-ink">{skill.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{skill.description}</p>
      <a href="/explore" className="mt-5 inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-forest transition-colors hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
        Explore this area <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
      </a>
    </article>
  );
}

type HomepageProps = {
  user: PublicUser | null;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError: string;
};

function Homepage({ user, onLogout, loggingOut, logoutError }: HomepageProps) {
  return (
    <div className="home-page min-h-screen overflow-hidden bg-paper text-ink">
      <Navbar
        user={user}
        onLogout={onLogout}
        loggingOut={loggingOut}
        onAccountAction={(action) => window.location.assign(action === "Log in" ? "/login" : "/register")}
      />
      {logoutError && <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-center text-sm text-red-800">{logoutError}</div>}

      <main>
        <section id="home" className="scroll-mt-24 relative isolate">
          <div className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_at_75%_25%,rgba(218,232,196,0.46),transparent_43%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1fr_0.92fr] lg:gap-6 lg:px-12 lg:pb-24 lg:pt-16">
            <div className="max-w-2xl lg:py-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/75 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-emerald-900 shadow-sm shadow-forest/5 sm:text-xs">
                <span className="size-2 rounded-full bg-[#a4c27d]" /> A student-powered skill exchange
              </span>
              <h1 className="mt-7 font-display text-[3.1rem] font-semibold leading-[0.98] tracking-[-0.065em] text-ink sm:text-6xl lg:text-[3.35rem] xl:text-[4.5rem]">
                Trade what you know.<br />
                <span className="relative inline-block text-emerald-800">
                  Learn what you love.
                  <svg aria-hidden="true" viewBox="0 0 400 18" className="absolute -bottom-2 left-1 h-3 w-[94%] text-[#c6d8a4] sm:-bottom-3 sm:h-4">
                    <path d="M4 12c85-13 244-13 389-2" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                You have something to teach. There’s something you’d love to learn. SkillSwap brings students together to make both happen.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ArrowLink href="/explore">Explore skills</ArrowLink>
                <a href="#how-it-works" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-6 text-sm font-semibold text-ink transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                  How it works <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="mt-5 text-xs font-medium text-slate-500">No perfect plan needed. Just bring your curiosity.</p>
            </div>
            <div className="lg:pl-5"><HeroArtwork /></div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-white py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <SectionHeading
              eyebrow="A simple exchange"
              title="A little knowledge goes a long way."
              description="SkillSwap makes learning feel more human: bring your curiosity, share what you know, and figure things out together."
            />
            <div className="relative mt-14 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
              <div aria-hidden="true" className="absolute left-[18%] right-[18%] top-10 hidden border-t border-dashed border-[#c9d6c0] md:block" />
              {steps.map((step) => (
                <article key={step.number} className="relative rounded-[1.75rem] border border-ink/8 bg-paper p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className={`grid size-[3.35rem] place-items-center rounded-2xl ${step.tone}`}><Icon name={step.icon} className="size-6" /></span>
                    <span className="font-display text-sm font-semibold tracking-[0.15em] text-slate-300">{step.number}</span>
                  </div>
                  <h3 className="mt-7 font-display text-xl font-semibold tracking-[-0.035em] text-ink">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="skills" className="scroll-mt-24 bg-paper py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading
                eyebrow="Skill areas to explore"
                title="Curiosity comes in many forms."
                description="These are example areas. Explore current student listings to see skills people can really teach and learn."
                align="left"
              />
              <a href="#how-it-works" className="mb-1 inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-ink/15 px-5 text-sm font-semibold text-ink transition-colors hover:border-forest hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:self-auto">
                How exchanges work <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-5">
              {skills.map((skill, index) => <SkillCard key={skill.title} skill={skill} index={index} />)}
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 bg-forest py-20 text-white sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:px-12">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-lime">Why SkillSwap</p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl lg:text-[3.25rem]">
                Good things happen when we learn <span className="text-lime">together.</span>
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/70 sm:text-lg">
                Learning isn’t a one-way street. It’s the questions, experiments, and shared “aha” moments that make a skill stick.
              </p>
              <a href="#students" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-semibold text-white transition-colors hover:border-lime hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime">
                See the student benefits <span aria-hidden="true">↓</span>
              </a>
              <div aria-hidden="true" className="mt-12 hidden max-w-xs rotate-[-3deg] rounded-2xl border border-white/15 bg-white/5 p-5 lg:block">
                <div className="flex gap-1.5"><span className="size-2 rounded-full bg-[#e9a87b]"/><span className="size-2 rounded-full bg-[#d8c06b]"/><span className="size-2 rounded-full bg-[#9fba87]"/></div>
                <div className="mt-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-lime/15 text-lime"><Icon name="swap" className="size-5" /></span><span className="text-sm font-medium text-white/85">Your next skill starts with a conversation.</span></div>
              </div>
            </div>
            <div className="divide-y divide-white/12">
              {reasons.map((reason, index) => (
                <article key={reason.title} className="grid grid-cols-[3rem_1fr] gap-4 py-6 first:pt-0 last:pb-0 sm:grid-cols-[3.75rem_1fr] sm:gap-6 sm:py-8">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white/8 text-lime sm:size-14"><Icon name={reason.icon} className="size-6" /></span>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold tracking-[0.18em] text-white/35">0{index + 1}</span>
                      <h3 className="font-display text-lg font-semibold tracking-[-0.025em] text-white sm:text-xl">{reason.title}</h3>
                    </div>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-white/65 sm:text-base">{reason.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="students" className="scroll-mt-24 bg-[#f2eee4] py-20 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:px-12">
            <div>
              <SectionHeading
                eyebrow="Made for student life"
                title="Skills that grow with you."
                description="Between classes, big ideas, and what-comes-next, learning from each other can make the journey a little more yours."
                align="left"
              />
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {studentBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#dce8c7] text-forest"><Icon name="check" className="size-3.5" /></span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div aria-hidden="true" className="absolute -inset-4 rotate-3 rounded-[2rem] bg-[#e2d5bc]" />
              <div className="relative overflow-hidden rounded-[1.75rem] bg-[#cbd9ba] p-6 sm:p-8">
                <div className="absolute -right-10 -top-12 size-44 rounded-full bg-[#e5a66e]" />
                <div className="relative flex min-h-[300px] flex-col justify-between sm:min-h-[340px]">
                  <div className="flex items-start justify-between">
                    <span className="rounded-full border border-forest/15 bg-white/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-forest">A good trade</span>
                    <Icon name="sparkles" className="size-7 text-white" />
                  </div>
                  <div className="relative mx-auto flex w-full max-w-[280px] items-end justify-center gap-3" aria-hidden="true">
                    <div className="relative h-40 w-28 rounded-t-[3rem] bg-[#52755f] sm:h-48 sm:w-32">
                      <div className="absolute -top-10 left-1/2 size-[4.5rem] -translate-x-1/2 rounded-full bg-[#bb8062]" />
                      <div className="absolute left-1/2 top-[-2.2rem] h-8 w-[4.8rem] -translate-x-1/2 rounded-t-full bg-[#343b36]" />
                      <div className="absolute left-1/2 top-[-0.7rem] size-1 -translate-x-2 rounded-full bg-ink" />
                    </div>
                    <div className="relative h-32 w-28 rounded-t-[3rem] bg-[#e9b660] sm:h-40 sm:w-32">
                      <div className="absolute -top-10 left-1/2 size-[4.5rem] -translate-x-1/2 rounded-full bg-[#e2ad87]" />
                      <div className="absolute left-1/2 top-[-2.1rem] h-9 w-[4.4rem] -translate-x-1/2 rounded-t-full bg-[#755744]" />
                      <div className="absolute left-1/2 top-[-0.65rem] size-1 -translate-x-2 rounded-full bg-ink" />
                    </div>
                    <span className="absolute -top-3 left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full border-4 border-[#cbd9ba] bg-forest text-lime"><Icon name="swap" className="size-5" /></span>
                  </div>
                  <div className="relative rounded-2xl border border-white/55 bg-white/65 p-4 backdrop-blur-sm">
                    <p className="font-display text-lg font-semibold tracking-[-0.035em] text-forest">Learn it by doing it.</p>
                    <p className="mt-1 text-xs leading-5 text-forest/75">Share a skill. Try something new. Make it yours.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="join" className="scroll-mt-24 bg-paper px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#dce8c7] px-6 py-14 sm:px-12 sm:py-16 lg:px-20 lg:py-20">
            <div aria-hidden="true" className="absolute -right-12 -top-24 size-72 rounded-full border-[1px] border-forest/10 sm:size-96" />
            <div aria-hidden="true" className="absolute -right-2 -top-14 size-52 rounded-full border-[1px] border-forest/10 sm:size-72" />
            <div aria-hidden="true" className="absolute bottom-[-30%] right-[22%] size-52 rounded-full bg-[#c7d9ae]/60 blur-2xl" />
            <div className="relative max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-emerald-900">Your next “aha” moment</p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-[-0.05em] text-forest sm:text-4xl lg:text-5xl">You already know enough to start sharing.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-forest/75 sm:text-lg">Bring your curiosity, meet a fellow learner, and see where a skill swap can take you.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ArrowLink href={user ? "/account" : "/register"}>Get started</ArrowLink>
                <a href="/explore" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-forest/20 px-6 text-sm font-semibold text-forest transition-colors hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Explore skills <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#142d28] text-white">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-14">
          <div className="flex flex-col gap-10 border-b border-white/12 pb-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <a href="/#home" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">
                <span className="grid size-9 place-items-center rounded-xl bg-lime text-forest"><Icon name="swap" className="size-5" /></span>
                <span className="font-display text-xl font-bold tracking-[-0.06em]">skill<span className="text-lime">swap</span></span>
              </a>
              <p className="mt-4 text-sm leading-6 text-white/60">A place for students to share what they know and learn what they love—together.</p>
            </div>
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-white/75">
              <a href="/#home" className="rounded-sm transition-colors hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">Home</a>
              <a href="/#how-it-works" className="rounded-sm transition-colors hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">How it works</a>
              <a href="/about" className="rounded-sm transition-colors hover:text-lime focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">About</a>
            </nav>
          </div>
          <div className="flex flex-col gap-2 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} SkillSwap. Made for curious minds.</p>
            <p>Share a skill. Grow together.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}


function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 text-center">
      <p role="status" className="rounded-xl border border-ink/10 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">Checking your sign-in…</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-ink/10 bg-white p-7 shadow-sm sm:p-10" aria-labelledby="not-found-title">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">404 · Page not found</p>
        <h1 id="not-found-title" className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-ink">We can’t find that page.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">The link may be old or the address may be typed incorrectly. You can return home or explore the available skills.</p>
        <div className="mt-6 flex flex-wrap gap-3"><a href="/" className="inline-flex min-h-11 items-center rounded-lg bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Go to homepage</a><a href="/explore" className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 px-5 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Explore skills</a></div>
      </section>
    </main>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const publicProfileId = (() => {
    const prefix = "/students/";
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return "";
    try { return decodeURIComponent(path.slice(prefix.length)); } catch { return ""; }
  })();
  const learningRoomId = (() => {
    const prefix = "/learning-rooms/";
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return "";
    try { return decodeURIComponent(path.slice(prefix.length)); } catch { return ""; }
  })();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not validate the session.");
        const payload = await response.json() as { user?: PublicUser };
        return payload.user ?? null;
      })
      .then(async (currentUser) => {
        setUser(currentUser);
        if (!currentUser || currentUser.role !== "user") {
          setProfileComplete(true);
          setProfileReady(true);
          return;
        }
        try {
          const response = await fetch("/api/profile", { credentials: "include", signal: controller.signal });
          const payload = await response.json() as { profile?: { profileComplete?: boolean } };
          setProfileComplete(response.ok && payload.profile?.profileComplete === true);
        } catch {
          // Let users reach the app if profile status cannot be checked; the profile page reports its own load error.
          setProfileComplete(true);
        } finally {
          if (!controller.signal.aborted) setProfileReady(true);
        }
      })
      .catch(() => {
        // React StrictMode aborts its first development-only effect run.
        // Ignore that cancellation so it cannot mark the user as logged out
        // before the replacement session check has finished.
        if (!controller.signal.aborted) { setUser(null); setProfileComplete(true); setProfileReady(true); }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthReady(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (user?.role === "admin" && path !== "/admin") {
      window.location.replace("/admin");
    } else if (user?.role === "user" && profileReady && !profileComplete && path !== "/profile") {
      window.location.replace("/profile");
    } else if (user && (path === "/login" || path === "/register")) {
      window.location.replace(getSafeReturnPath());
    } else if (user && path === "/admin" && user.role !== "admin") {
      window.location.replace("/account");
    } else if (!user && (["/account", "/profile", "/my-skills", "/explore", "/requests", "/sessions", "/students", "/messages", "/learning-rooms", "/roadmap", "/admin"].includes(path) || Boolean(learningRoomId))) {
      window.location.replace(`/login?redirect=${encodeURIComponent(path)}`);
    }
  }, [authReady, profileReady, profileComplete, user, path]);

  const logout = async () => {
    setLogoutError("");
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("The server could not end this session.");
      setUser(null);
      window.location.replace("/");
    } catch {
      setLogoutError("Couldn’t log out. Check your connection and try again.");
      setLoggingOut(false);
    }
  };

  const isAuthPage = path === "/login" || path === "/register";
  const isProtectedPath = ["/account", "/profile", "/my-skills", "/explore", "/requests", "/sessions", "/students", "/messages", "/learning-rooms", "/roadmap", "/admin"].includes(path) || Boolean(learningRoomId);
  if ((!authReady || (user?.role === "user" && !profileReady)) && (isAuthPage || isProtectedPath || Boolean(user))) return <AuthLoading />;
  if (user?.role === "user" && profileReady && !profileComplete && path !== "/profile") return <AuthLoading />;
  if (user && isAuthPage) return <AuthLoading />;
  if (isProtectedPath && !user) return <AuthLoading />;
  if (path === "/admin" && user?.role === "admin") return <AdminDashboardPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/explore" && user) return <ExplorePage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/requests" && user) return <RequestsPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/sessions" && user) return <SessionsPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/students" && user) return <StudentRankingsPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/roadmap" && user) return <RoadmapPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/messages" && user) return <MessagesPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/learning-rooms" && user) return <LearningRoomsPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (learningRoomId && user) return <MeetingRoomPage sessionId={learningRoomId} openRoom={learningRoomId.startsWith("open-")} user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (publicProfileId) return <PublicProfilePage profileId={publicProfileId} user={user} />;
  if (path === "/profile" && user) return <ProfilePage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/my-skills" && user) return <MySkillsPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  if (path === "/account") {
    if (!user) return <AuthLoading />;
    return <AccountPage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
  }
  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegistrationPage />;
  if (path === "/about") return <AboutPage user={user} onLogout={logout} loggingOut={loggingOut} />;
  if (path !== "/") return <NotFound />;

  return <Homepage user={user} onLogout={logout} loggingOut={loggingOut} logoutError={logoutError} />;
}

export default App;
