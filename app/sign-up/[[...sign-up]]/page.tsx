import { SignUp } from '@clerk/nextjs'
import { BASE_PATH } from '@/lib/basePath'

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp path={`${BASE_PATH}/sign-up`} />
    </main>
  )
}
