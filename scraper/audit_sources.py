
import urllib.robotparser
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SOURCES = [
    "https://mdcatguru.com/",
    "https://www.diffmdcat.com/",
    "https://premeth.com/",
]

USER_AGENT = "MDCATArenaResearchBot/1.0"


def audit_robots(site_url):
    parsed = urlparse(site_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    print(f"\nWebsite: {parsed.netloc}")
    print(f"robots.txt: {robots_url}")

    request = Request(
        robots_url,
        headers={"User-Agent": USER_AGENT}
    )

    try:
        with urlopen(request, timeout=15) as response:
            content = response.read().decode("utf-8", errors="replace")
            print(f"HTTP status: {response.status}")
            print("robots.txt contents:")
            print(content[:5000])

            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)
            parser.parse(content.splitlines())

            print(
                "Homepage allowed:",
                parser.can_fetch(USER_AGENT, site_url)
            )

    except Exception as error:
        print(f"Could not verify robots.txt: {error}")
        print("Do not treat this as permission to scrape.")


def main():
    for source in SOURCES:
        audit_robots(source)


if __name__ == "__main__":
    main()
