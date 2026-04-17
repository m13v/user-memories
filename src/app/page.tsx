export default function HomePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24">
      <h1 className="text-4xl font-bold text-zinc-900">AI Browser Profile</h1>
      <p className="mt-4 text-zinc-500">
        npm package that extracts user identity from browser data into a
        self-ranking SQLite database. Installs as a Claude Code skill.
      </p>
      <p className="mt-6">
        <a className="text-teal-600" href="/t/how-to-install-a-npm-package">
          Guide: how to install an npm package (and what the installer-package
          pattern really does)
        </a>
      </p>
    </main>
  );
}
