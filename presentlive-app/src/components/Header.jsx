// src/components/Header.jsx
import { Group, Title, ActionIcon } from "@mantine/core";
import { IconQuestionMark } from "@tabler/icons-react";
import { Link } from "react-router-dom";

function Header() {
  return (
    <Group justify="space-between" px="xl" py="sm" bg="dark.8">
      <Title order={1} c="white" fw={700}>
        <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
          PresentLive
        </Link>
      </Title>
      <ActionIcon
        variant="filled"
        radius="xl"
        size="lg"
        className="question-btn"
        aria-label="Help"
      >
        <IconQuestionMark className="question-icon" />
      </ActionIcon>
    </Group>
  );
}

export default Header;
