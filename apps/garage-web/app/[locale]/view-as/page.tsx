import { ViewAsEntry } from '@/features/auth/view-as-entry';

/** The admin app's "View as garage" link: /view-as#<one-time code> (flow.md 11.3). */
export default function ViewAsPage() {
  return <ViewAsEntry />;
}
