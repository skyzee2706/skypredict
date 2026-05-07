const sections = [...document.querySelectorAll("section[id]")];
const links = [...document.querySelectorAll(".sidebar a")];
const byId = new Map(links.map((link) => [link.getAttribute("href")?.slice(1), link]));

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.remove("active"));
    byId.get(visible.target.id)?.classList.add("active");
  },
  { rootMargin: "-18% 0px -68% 0px", threshold: [0.1, 0.3, 0.6] }
);
sections.forEach((section) => observer.observe(section));

document.querySelectorAll("pre").forEach((pre) => {
  const wrapper = document.createElement("div");
  wrapper.className = "code-wrap";
  pre.parentNode.insertBefore(wrapper, pre);
  wrapper.appendChild(pre);
  const button = document.createElement("button");
  button.className = "copy-btn";
  button.type = "button";
  button.textContent = "Copy";
  wrapper.appendChild(button);
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pre.innerText.trim());
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1300);
  });
});

const search = document.querySelector("#docSearch");
search?.addEventListener("input", () => {
  const q = search.value.trim().toLowerCase();
  sections.forEach((section) => {
    const haystack = section.innerText.toLowerCase();
    section.classList.toggle("hidden-by-search", Boolean(q) && !haystack.includes(q));
  });
});
