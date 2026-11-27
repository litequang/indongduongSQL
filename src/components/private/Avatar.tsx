import type { User } from "../../../shared/contracts";
import { PrivateImage } from "./ImageAttachment";
export function Avatar({
  user,
  small = false,
  large = false,
}: {
  user: User;
  small?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""} ${large ? "avatar-large" : ""}`}
      aria-label={user.name}
    >
      {user.avatarRegistryId ? (
        <PrivateImage id={user.avatarRegistryId} alt={user.name} />
      ) : (
        user.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
