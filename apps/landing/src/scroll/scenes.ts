export interface Scene {
  id: string;
  index: string;
  title: string; // may contain <em>
  body: string;
  image: string;
  imageMobile: string;
  video?: string;
  dark?: boolean;
  stats?: { value: string; label: string }[];
}

export const scenes: Scene[] = [
  {
    id: 'home',
    index: 'Idle',
    title: 'Most of your internet<br />goes <em>unused.</em>',
    body: 'A typical home uses a fraction of the bandwidth it pays for. Root puts the rest to work, quietly, in the background, while you keep browsing.',
    image: '/assets/scenes/home.webp',
    imageMobile: '/assets/scenes/home-m.webp',
    stats: [
      { value: '< 5%', label: 'of bandwidth used' },
      { value: '24 / 7', label: 'paid for' },
    ],
  },
  {
    id: 'roots',
    index: 'Network',
    title: 'Idle bandwidth becomes<br />research <em>infrastructure.</em>',
    body: 'Root routes public web requests from verified AI labs through the network, so models learn from fresh, open data instead of scraping in the dark.',
    image: '/assets/scenes/roots.webp',
    imageMobile: '/assets/scenes/roots-m.webp',
    video: '/assets/scenes/roots.mp4',
  },
  {
    id: 'lab',
    index: 'Buyers',
    title: 'Verified labs.<br />Public data. <em>Real</em> research.',
    body: 'Every buyer is verified. Every request is metered and auditable. Only public pages are ever fetched, never your own traffic.',
    image: '/assets/scenes/lab.webp',
    imageMobile: '/assets/scenes/lab-m.webp',
  },
  {
    id: 'frost',
    index: 'Privacy',
    title: 'Your data<br />stays <em>yours.</em>',
    body: 'Root never sees your browsing, files or passwords. It uses spare capacity you already pay for, and nothing else.',
    image: '/assets/scenes/frost.webp',
    imageMobile: '/assets/scenes/frost-m.webp',
    video: '/assets/scenes/frost.mp4',
  },
  {
    id: 'tokens',
    index: 'Rewards',
    title: 'Get rewarded.<br />Own the <em>network.</em>',
    body: 'Earn Root points for every gigabyte you share. The people who power the network are the people who own it.',
    image: '/assets/scenes/tokens.webp',
    imageMobile: '/assets/scenes/tokens-m.webp',
    stats: [
      { value: '1 GB', label: 'shared = points earned' },
      { value: '0', label: 'personal data collected' },
    ],
  },
];

export function renderScenes(container: HTMLElement, availableVideos: Set<string>) {
  container.innerHTML = scenes
    .map((s, i) => {
      const useVideo = s.video && availableVideos.has(s.video);
      const media = useVideo
        ? `<video muted loop playsinline autoplay preload="metadata" poster="${s.image}" data-video>
             <source src="${s.video}" type="video/mp4" />
           </video>`
        : `<picture>
             <source media="(max-width: 767px)" srcset="${s.imageMobile}" />
             <img src="${s.image}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" />
           </picture>`;
      const stats = s.stats
        ? `<div class="frame__stat">${s.stats
            .map((st) => `<div><strong>${st.value}</strong><span>${st.label}</span></div>`)
            .join('')}</div>`
        : '';
      return `
        <section class="frame ${s.dark ? 'frame--dark' : ''}" data-frame data-id="${s.id}">
          <div class="frame__sticky">
            <div class="frame__media" data-media>${media}</div>
            <div class="frame__veil"></div>
            <div class="frame__content" data-content>
              <p class="frame__index">${String(i + 1).padStart(2, '0')} — ${s.index}</p>
              <h2 class="frame__title">${s.title}</h2>
              <p class="frame__body">${s.body}</p>
              ${stats}
            </div>
            <div class="frame__progress" data-progress><span>${String(i + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}</span><i></i></div>
          </div>
        </section>`;
    })
    .join('');
}
