import Link from "next/link";

export default function Home() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Bookings for your business, <span className="text-indigo-600">without the phone calls</span>
      </h1>
      <p className="mt-6 text-lg text-gray-600">
        Salons, clinics, gyms and training centers get their own booking page. Customers pick a
        service, a staff member and a free time - no double bookings, ever.
      </p>
      <div className="mt-10 flex justify-center gap-4">
        <Link
          href="/register"
          className="rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 font-medium hover:bg-gray-50"
        >
          Log in
        </Link>
      </div>
    </section>
  );
}
