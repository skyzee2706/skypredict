const sections = [...document.querySelectorAll("section[id]")];
const links = [...document.querySelectorAll(".toc a")];
const byId = new Map(links.map((link) => [link.getAttribute("href")?.slice(1), link]));
const headerOffset = 140;

function setActive(id) {
  links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
}

function updateActiveSection() {
  const scrollPosition = window.scrollY + headerOffset;
  let current = sections[0]?.id;

  for (const section of sections) {
    if (section.offsetTop <= scrollPosition) {
      current = section.id;
    } else {
      break;
    }
  }

  if (current) setActive(current);
}

links.forEach((link) => {
  link.addEventListener("click", () => {
    const id = link.getAttribute("href")?.slice(1);
    if (id) setActive(id);
  });
});

window.addEventListener("scroll", updateActiveSection, { passive: true });
window.addEventListener("resize", updateActiveSection);
updateActiveSection();

document.querySelector("#printWhitepaper")?.addEventListener("click", () => window.print());

