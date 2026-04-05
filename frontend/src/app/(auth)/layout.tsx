export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-background">
            {/* Left Column - Branding (Hidden on mobile) */}
            <div className="hidden md:flex flex-col justify-center items-center bg-zinc-950 border-r border-border p-12">
                <div className="max-w-md space-y-6 text-center">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-6">
                        <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight text-white">
                        NexusSec
                    </h1>
                    <p className="text-lg text-zinc-400">
                        Enterprise-grade API Security Scanner. Discover, analyze, and mitigate attack vectors across your infrastructure.
                    </p>
                </div>
            </div>

            {/* Right Column - Auth Form */}
            <div className="flex flex-col justify-center px-8 sm:px-12 lg:px-24">
                <div className="w-full max-w-sm mx-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
