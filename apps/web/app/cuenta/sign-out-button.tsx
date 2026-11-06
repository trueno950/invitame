import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import { SignOutButton as SharedSignOutButton } from "../_components/sign-out-button.tsx";

/** The customer's sign-out (M2 T8c): the shared button, ending on `/ingresar`. */
export function SignOutButton() {
  return (
    <SharedSignOutButton
      failedMessage={ACCOUNT_COPY.signOutFailed}
      label={ACCOUNT_COPY.signOut}
      pendingLabel={ACCOUNT_COPY.signingOut}
      signInPath="/ingresar"
    />
  );
}
