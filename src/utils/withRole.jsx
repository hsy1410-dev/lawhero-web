// utils/withRole.js
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export function withRole(Component, requiredRoles) {
  return function Wrapped({ user, role, ...props }) {
    const navigate = useNavigate();

    useEffect(() => {
      if (!user) {
        navigate("/login");
        return;
      }

      if (!role) return; // role 아직 로딩 중

      const allowed = Array.isArray(requiredRoles)
        ? requiredRoles.includes(role)
        : role === requiredRoles;

      if (!allowed) {
        navigate("/403");
      }
    }, [user, role]);

    if (!user || !role) {
      return <div>Loading...</div>;
    }

    return <Component {...props} />;
  };
}