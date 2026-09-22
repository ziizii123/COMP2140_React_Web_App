import { Box, Text } from "@mantine/core";

function Footer() {
  return (
    <Box mx="xl" py="md" style={{ color: "gray", textAlign: "center" }}>
      <Text>
        &copy; {new Date().getFullYear()} PresentLive. All rights reserved.
      </Text>
    </Box>
  );
}

export default Footer;
